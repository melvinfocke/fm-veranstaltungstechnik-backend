import { Request } from 'express';
import cron from 'node-cron';

const spamList: Map<string, number> = new Map();

export const verify = (req: Request) => {
  const ip = req.ip || '';
  let count = spamList.get(ip) || 0;

  count += 1;

  if (count > 5) return { reject: true, spam: true, description: 'Too many requests within a day' };

  spamList.set(ip, count);

  if (count > 2) return { reject: false, spam: true, description: 'More than 2 requests within a day' };
  return { reject: false, spam: false, description: 'Success' };
};

cron.schedule('0 0 * * *', () => spamList.clear());
