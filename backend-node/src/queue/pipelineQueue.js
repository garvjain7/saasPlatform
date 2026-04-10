import { Queue } from "bullmq";
// import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// DISABLED FOR NATIVE TESTING
/*
const connection = new IORedis(process.env.REDIS_URI || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const pipelineQueue = new Queue("MLPipelineQueue", { connection });
*/
export const pipelineQueue = { add: async () => { throw new Error("BullMQ disabled for native fallback processing.") } };

console.log("🛠️ BullMQ Pipeline Queue disabled");
