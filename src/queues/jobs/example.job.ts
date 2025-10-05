import { Job } from 'bullmq';

/**
 * Processes an example job.
 * @param job The job to process.
 */
const processExampleJob = async (job: Job) => {
  console.log(`Processing job #${job.id} with data:`, job.data);
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`Job #${job.id} completed`);
  return { status: 'Completed', jobId: job.id };
};

export default processExampleJob;
