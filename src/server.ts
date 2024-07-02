import express from 'express';
import { config } from 'dotenv';
import { z } from 'zod';
import { zString, zEmail, zDate, zTime, zISODateTime } from './validate';
import { send as sendMail } from './mail';
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
export const MAIL_TO = process.env.MAIL_TO ?? '';

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
  const { reject, spam, description } = verifySpam(req);
  console.log(`IP: ${req.ip}, Reject: ${reject}, Spam: ${spam}, Description: ${description}`);
  if (reject) return res.status(429).json({ errors: [description] });

  const parsedBody = parseBody(req.body);

  if (!parsedBody.success || !parsedBody.data) return res.status(400).json({ errors: parsedBody.errors });

  const { first_name, last_name, email, date, location, time_start, time_end, type_of_request, message, timestamp } =
    parsedBody.data;

  const convertedDate = new Date(date).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const subject = (spam || !timestamp ? '***SPAM*** ' : '') + `Kontaktanfrage zu ${type_of_request}`;
  const text = `-----\n${location}, ${convertedDate}, ${time_start} bis ${time_end}\n-----\n\n${message}`;
  sendMail(`${first_name} ${last_name}`, email, subject, text);
  res.status(200).json({ message: 'Success' });
});

server.listen(PORT, () => {
  console.log('Server is running...');
});

/* FUNCTIONS */
const parseBody = (body: any) => {
  const parsed = z
    .object({
      first_name: zString('first_name', 2, 30),
      last_name: zString('last_name', 2, 30),
      email: zEmail('email'),
      date: zDate('date'),
      location: zString('locaton', 2, 40),
      time_start: zTime('time_start'),
      time_end: zTime('time_end'),
      type_of_request: zString('type_of_request', 2, 40),
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
