import express from 'express';
import { config } from 'dotenv';
import { z } from 'zod';
import { zString, zEmail, zDate, zTime, zISODateTime, zEnum, zLiteral } from './validate';
import { sendFormSubmission, sendSpamNotification } from './mail';
import { verify as verifySpam } from './spam';

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

server.post('/v1/contact-form/submit', (req, res) => {
  const { reject, rejectMessage, spam, spamReasons } = verifySpam(req);
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

  const subject = `${spam ? '***SPAM*** ' : ''}Kontaktanfrage ${type_of_request_prefix} ${overridden_type_of_request}`;
  const text =
    type_of_request === 'Anderes Anliegen'
      ? message
      : `-----\n${location}, ${convertedDate}, ${time_start} bis ${time_end}\n-----\n\n${message}`;
  sendFormSubmission(`${first_name} ${last_name}`, email, subject, text); // Notification about a new contact form submission

  if (spam) {
    const subject = `Verdächtige Kontaktanfrage ${type_of_request_prefix} ${overridden_type_of_request} erkannt`;
    const spamReasonsAsString = spamReasons
      .map(
        (reason) =>
          `• ${reason
            .replace('More than 2 requests within a day', 'Mehr als 2 Anfragen innerhalb eines Tages')
            .replace('JavaScript is disabled', 'JavaScript ist deaktiviert')}`
      )
      .join('\n');
    const now = new Date().toISOString();
    const text =
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
      `IP-Adresse: ipinfo.mfvpn.com/?ip=${req.ip}\n` +
      `JS Zeitstempel Client: ${timestamp ?? 'null'}\n` +
      `JS Zeitstempel Server: ${now}\n` +
      `User-Agent: ${req.get('User-Agent')}\n` +
      `--------------------\n\n` +
      `Gründe für die Spam-Einstufung:\n` +
      `${spamReasonsAsString}\n\n` +
      `Bitte überprüfe diese Anfrage und ergreife gegebenenfalls notwendige Maßnahmen.\n\n` +
      `Viele Grüße,\n` +
      `FM Spam-Filter\n\n` +
      `(${now.replace('T', ' ').replace(/\.\d{3}Z/, ' UTC')})`;
    sendSpamNotification(subject, text); // Notification about a potential spam submission
  }
  res.status(200).json({ message: 'Success' });
});

server.listen(PORT, () => {
  console.log('Server is running...');
});

/* FUNCTIONS */
const parseBody = (body: any) => {
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
