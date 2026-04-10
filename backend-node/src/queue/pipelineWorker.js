import { Worker } from "bullmq";
import IORedis from "ioredis";
import path from "path";
import { spawn } from "child_process";
import Dataset from "../models/Dataset.js";
import dotenv from "dotenv";

dotenv.config();

// DISABLED FOR NATIVE TESTING IF REDIS IS OFFLINE
/*
const connection = new IORedis(process.env.REDIS_URI || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const pipelineWorker = new Worker(
  "MLPipelineQueue",
  async (job) => { console.log('Mock Worker'); }, { connection, concurrency: 2 }
);

pipelineWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} has completed!`);
});
*/

console.log("👷‍♂️ BullMQ Worker connection disabled for native processing fallback tests.");
