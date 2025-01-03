import express from 'express';
import { config } from 'dotenv';
import { z } from 'zod';
import { zString, zEmail, zDate, zTime, zISODateTime, zEnum, zLiteral } from './validate';
import { sendFormSubmission, sendSpamNotification } from './mail';
import { verify as verifySpam } from './spam';
import { readFile, writeFile } from 'fs/promises';
import ical from 'node-ical';
import { createHash } from 'crypto';
import cron from 'node-cron';

const server = express();

/* ENVIRONMENT VARIABLES */
config();
export const PORT = process.env.PORT || 80;
export const MAIL_HOST = process.env.MAIL_HOST ?? '';
export const MAIL_PORT = Number(process.env.MAIL_PORT) ?? 465;
export const MAIL_SECURE = Boolean(process.env.MAIL_SECURE ?? true);
export const MAIL_USER = process.env.MAIL_USER ?? '';
export const MAIL_PASS = process.env.MAIL_PASS ?? '';
export const MAIL_TO_FORM_SUBMISSION = process.env.MAIL_TO_FORM_SUBMISSION ?? '';
export const MAIL_TO_FORM_SPAM = process.env.MAIL_TO_FORM_SPAM ?? '';
export const ACTION_URL_PATTERN = process.env.ACTION_URL_PATTERN ?? 'http://127.0.0.1/v1/{OBJECT}/{ID}/{ACTION}';
export const ICAL_URL = (process.env.ICAL_URL ?? '').replace('webcal://', 'https://');

/* GLOBAL VARIABLES */
let icalHash = '';
export let blockedDates: Date[] = [];

/* EXPRESS SETTINGS */
server.set('trust proxy', true);
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

/* ROUTES */
server.get('/dev-frontend', (req, res) => {
  res.sendFile('index.html', { root: 'src/frontend' });
});

server.get('/dev-calendar', async (req, res) => {
  res.sendFile('index.html', { root: 'src/calendar' });
});

server.get('/v1/spam/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  const spamRequests = await getHoldSpamRequests();
  const spamRequest = spamRequests[id];
  if (!spamRequest) return res.status(404).json({ errors: ['Spam request not found'] });
  if (action === 'accept') {
    sendFormSubmission(spamRequest.from, spamRequest.replyTo, spamRequest.subject, spamRequest.text);
    delete spamRequests[id];
    await setHoldSpamRequests(spamRequests);
    res.status(200).json({ message: 'Success' });
  } else if (action === 'reject') {
    delete spamRequests[id];
    await setHoldSpamRequests(spamRequests);
    res.status(200).json({ message: 'Success' });
  } else {
    res.status(400).json({ errors: ['Invalid action'] });
  }
});

server.get('/v1/calendar/blocked-dates', async (req, res) => {
  res.json(blockedDates);
});

server.post('/v1/contact-form/submit', async (req, res) => {
  const { reject, rejectMessage, spam, spamReasons } = await verifySpam(req);
  console.log(
    `IP: ${req.ip}, Reject: ${reject}, RejectMessage: ${rejectMessage}, Spam: ${spam}, SpamReasons: ${spamReasons}`
  );
  if (reject) return res.status(429).json({ errors: [rejectMessage] });

  const parsedBody = parseBody(req.body);

  if (!parsedBody.success || !parsedBody.data) return res.status(400).json({ errors: parsedBody.errors });

  let { first_name, last_name, email, date, location, time_start, time_end, type_of_request, message, timestamp } =
    parsedBody.data;

  const convertedDate = new Date(date ?? '').toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  let type_of_request_prefix = 'zu';
  let overridden_type_of_request = type_of_request as string;
  if (type_of_request === 'Lasershow') type_of_request_prefix = 'zu einer';
  if (type_of_request === 'Verleih von Technik') type_of_request_prefix = 'zum';
  if (type_of_request === 'Anderes Anliegen') {
    type_of_request_prefix = 'zu einem';
    overridden_type_of_request = 'anderen Anliegen';
  }

  let blockedDateHint = spamReasons.includes('Date is already blocked')
    ? 'Datumskollision - Datum ist bereits geblockt!!!\n'
    : '';

  const subject = `${spam ? '***SPAM*** ' : ''}Kontaktanfrage ${type_of_request_prefix} ${overridden_type_of_request}`;
  const text =
    type_of_request === 'Anderes Anliegen'
      ? message
      : `-----\n${location}, ${convertedDate}, ${time_start} bis ${time_end}\n${blockedDateHint}-----\n\n${message}`;

  if (!spam) {
    sendFormSubmission(`${first_name} ${last_name}`, email, subject, text); // Notification about a new contact form submission
    res.status(200).json({ message: 'Success' });
    return;
  }
  // Store the spam request in a file
  const spamRequests = await getHoldSpamRequests();
  const spamRequestId = generateSpamRequestId(spamRequests);
  spamRequests[spamRequestId] = {
    from: `${first_name} ${last_name}`,
    replyTo: email,
    subject,
    text
  };
  await setHoldSpamRequests(spamRequests);

  const reportSubject = `Verdächtige Kontaktanfrage ${type_of_request_prefix} ${overridden_type_of_request} erkannt`;
  const spamReasonsAsString = spamReasons
    .map(
      (reason) =>
        `• ${reason
          .replace('More than 2 requests within a day', 'Mehr als 2 Anfragen innerhalb eines Tages')
          .replace('JavaScript is disabled', 'JavaScript ist deaktiviert')
          .replace('Not in European Union', 'Nicht in der Europäischen Union')
          .replace('Date is already blocked', 'Datum ist bereits geblockt')}`
    )
    .join('\n');
  const actionButtons =
    `Aktionen:\n` +
    `**Anfrage weiterleiten**\n` +
    `  [${ACTION_URL_PATTERN.replace('{ACTION}', 'accept')
      .replace('{ID}', spamRequestId)
      .replace('{OBJECT}', 'spam')}]\n` +
    `**Anfrage verwerfen**\n` +
    `  [${ACTION_URL_PATTERN.replace('{ACTION}', 'reject')
      .replace('{ID}', spamRequestId)
      .replace('{OBJECT}', 'spam')}]\n\n`;
  const now = new Date().toISOString();
  const reportText =
    `Hallo Admin,\n\n` +
    `eine neue Kontaktanfrage wurde als Spam erkannt:\n\n` +
    `--------------------\n` +
    `Vorname: ${first_name}\n` +
    `Nachname: ${last_name}\n` +
    `E-Mail: ${email}\n` +
    `Art der Anfrage: ${type_of_request}\n` +
    `Ort: ${location}\n` +
    `Datum: ${type_of_request === 'Anderes Anliegen' ? 'null' : convertedDate}\n` +
    `Uhrzeit von: ${time_start}\n` +
    `Uhrzeit bis: ${time_end}\n` +
    `Nachricht: ${message}\n` +
    `--------------------\n` +
    `IP-Info: https://ipinfo.f3e.network/?ip=${req.ip}\n` +
    `JS Zeitstempel Client: ${timestamp ?? 'null'}\n` +
    `JS Zeitstempel Server: ${now}\n` +
    `User-Agent: ${req.get('User-Agent')}\n` +
    `--------------------\n\n` +
    `Gründe für die Spam-Einstufung:\n` +
    `${spamReasonsAsString}\n\n` +
    `Bitte überprüfe diese Anfrage und ergreife gegebenenfalls notwendige Maßnahmen.\n\n` +
    actionButtons +
    `Viele Grüße,\n` +
    `FM Spam-Filter\n\n` +
    `(${now.replace('T', ' ').replace(/\.\d{3}Z/, ' UTC')})`;
  sendSpamNotification(reportSubject, reportText);
  res.status(200).json({ message: 'Success' });
});

server.listen(PORT, () => {
  console.log('Server is running...');
});

/* FUNCTIONS */
const parseBody = (body: any) => {
  if (body.date) body.date = body.date.split('.').reverse().join('-') ?? body.date;

  let isOtherRequest = z
    .object({
      type_of_request: z.literal('Anderes Anliegen')
    })
    .safeParse(body).success;

  let parsed = isOtherRequest
    ? z
        .object({
          first_name: zString('first_name', 2, 30),
          last_name: zString('last_name', 2, 30),
          email: zEmail('email'),
          type_of_request: zLiteral('type_of_request', 'Anderes Anliegen'),
          location: zString('location', 0, 40)
            .optional()
            .transform(() => null),
          date: zString('date', 0, 10)
            .optional()
            .transform(() => null),
          time_start: zString('time_start', 0, 5)
            .optional()
            .transform(() => null),
          time_end: zString('time_end', 0, 5)
            .optional()
            .transform(() => null),
          message: zString('message', 2, 1000),
          timestamp: zISODateTime('timestamp').optional()
        })
        .safeParse(body)
    : z
        .object({
          first_name: zString('first_name', 2, 30),
          last_name: zString('last_name', 2, 30),
          email: zEmail('email'),
          type_of_request: zEnum('type_of_request', ['Musik / DJ', 'Lasershow', 'Verleih von Technik']),
          location: zString('location', 2, 40),
          date: zDate('date'),
          time_start: zTime('time_start'),
          time_end: zTime('time_end'),
          message: zString('message', 2, 1000),
          timestamp: zISODateTime('timestamp').optional()
        })
        .safeParse(body);

  return {
    success: parsed.success,
    errors: parsed.error?.issues.map((issue) => issue.message),
    data: parsed.data
  };
};

type SpamRequestFile = {
  [key: string]: { from: string; replyTo: string; subject: string; text: string };
};

const getHoldSpamRequests = async () => {
  try {
    const data = await readFile('spam-requests.json', 'utf-8');
    return JSON.parse(data) as SpamRequestFile;
  } catch (_) {
    return {};
  }
};

const setHoldSpamRequests = async (data: SpamRequestFile) => {
  await writeFile('spam-requests.json', JSON.stringify(data, null, 2));
};

const generateSpamRequestId = (data: SpamRequestFile): string => {
  const CHARS = 'abcdefghkmnopqrstuvwxyz23456789';
  const id = Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  if (data[id]) return generateSpamRequestId(data);
  return id;
};

const refreshBlockedDates = async () => {
  let tempBlockedDates: Date[] = [];
  const data = await ical.async.fromURL(ICAL_URL);

  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const event = data[key] as any;

      if (event.type !== 'VEVENT') continue;

      const start = new Date(event.start);
      const end = new Date(new Date(event.end).getTime() - 1);

      const DAY_IN_MILLIS = 86_400_000;
      for (let i = start.getTime() - DAY_IN_MILLIS; i <= end.getTime() + DAY_IN_MILLIS; i += DAY_IN_MILLIS) {
        const newDate = new Date(i);
        tempBlockedDates.push(new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate()));
      }
    }
  }

  tempBlockedDates.sort((a, b) => a.getTime() - b.getTime());
  tempBlockedDates = tempBlockedDates.filter((item, pos, arr) => !pos || item.getTime() !== arr[pos - 1].getTime());

  const newIcalHash = createHash('sha256').update(JSON.stringify(tempBlockedDates)).digest('hex');
  if (newIcalHash === icalHash) return;
  icalHash = newIcalHash;
  blockedDates = tempBlockedDates;

  const now = new Date().toISOString().split('.')[0].replace('T', ' ') + ' UTC';
  console.log(`Blocked dates refreshed (${now})`);
};

/* CRON JOBS */
cron.schedule('*/1 * * * *', async () => {
  await refreshBlockedDates();
});
refreshBlockedDates(); // Initial run
