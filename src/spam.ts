import { Request } from 'express';
import cron from 'node-cron';
import { z } from 'zod';
import { zISODateTime } from './validate';

const spamList: Map<string, number> = new Map();

export const verify = (req: Request) => {
  let spamReasons: string[] = [];

  const ip = req.ip || '';
  let count = spamList.get(ip) || 0;
  const js = isJavaScriptEnabled(req);

  count += 1;

  if (count > 5) {
    spamReasons.push('Too many requests within a day');
    if (!js) spamReasons.push('JavaScript is disabled');
    return { reject: true, rejectMessage: 'Too many requests within a day', spam: true, spamReasons };
  }

  spamList.set(ip, count);

  if (count > 2) {
    spamReasons.push('More than 2 requests within a day');
    if (!js) spamReasons.push('JavaScript is disabled');
    return { reject: false, rejectMessage: undefined, spam: true, spamReasons };
  }

  if (!js) spamReasons.push('JavaScript is disabled');
  return { reject: false, rejectMessage: undefined, spam: !js, spamReasons };
};

cron.schedule('0 0 * * *', () => spamList.clear());

const isJavaScriptEnabled = (req: Request) => {
  return z
    .object({
      timestamp: zISODateTime('timestamp')
    })
    .safeParse(req.body).success;
};
