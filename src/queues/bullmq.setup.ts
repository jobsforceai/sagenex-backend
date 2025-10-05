import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const isDocker = process.env.IS_DOCKER === 'true';

const connection = new Redis({
  host: isDocker ? (process.env.REDIS_HOST || 'redis') : 'localhost',
  port: isDocker ? (Number(process.env.REDIS_PORT) || 6379) : 6380,
  maxRetriesPerRequest: null
});

// Reusable queue instance
export const exampleQueue = new Queue('exampleQueue', { connection });

// Reusable worker instance
export const setupWorker = (processorPath: string) => {
  return new Worker('exampleQueue', processorPath, { connection });
};
