import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: "https://82fdb4a6fd4628d720932bee674b6f7d.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "316580a617ece85e36f746653265e92f",
    secretAccessKey: "4abbfedfc5977894a2f6ee505a9c5757a335984786fecf997dd350a4957b8f40",
  },
});

const command = new ListObjectsV2Command({
  Bucket: "focades-pro",
  MaxKeys: 10,
});

const response = await r2Client.send(command);
console.log(`📊 Total archivos en R2: ${response.KeyCount || 0}`);
console.log("\n📁 Primeros 10 archivos:");
response.Contents?.forEach((item) => {
  console.log(`  - ${item.Key} (${(item.Size / 1024).toFixed(2)} KB)`);
});
