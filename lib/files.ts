// 시험지·답지 파일 저장 (MongoDB GridFS). 별도 스토리지 서비스 없이 DB 안에 보관한다.
import mongoose from "mongoose";
import { dbConnect } from "./db";
import { isoDate } from "./date";
import { FILE_KINDS, type FileKind, type FileMeta } from "./analysis-types";

export const FILE_BUCKET = "testfiles";
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export { FILE_KINDS, FILE_KIND_LABEL } from "./analysis-types";
export type { FileKind, FileMeta } from "./analysis-types";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/haansofthwp",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/octet-stream",
]);

export function isAllowedType(contentType: string, filename: string): boolean {
  if (ALLOWED_TYPES.has(contentType)) return true;
  return /\.(pdf|png|jpe?g|webp|heic|hwp|hwpx)$/i.test(filename);
}

export async function getBucket() {
  await dbConnect();
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB 연결이 준비되지 않았습니다.");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: FILE_BUCKET });
}

function serializeFile(f: any): FileMeta {
  const meta = f.metadata ?? {};
  return {
    id: String(f._id),
    filename: f.filename as string,
    contentType: (f.contentType ?? meta.contentType ?? "application/octet-stream") as string,
    size: Number(f.length ?? 0),
    kind: (FILE_KINDS.includes(meta.kind) ? meta.kind : "etc") as FileKind,
    subject: (meta.subject ?? "") as string,
    date: meta.date ? isoDate(meta.date) : "",
    uploadedAt: f.uploadDate ? new Date(f.uploadDate).toISOString() : "",
  };
}

export async function uploadTestFile(opts: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  termId: string;
  subject: string;
  date: string;
  kind: FileKind;
}): Promise<FileMeta> {
  const bucket = await getBucket();
  const id = await new Promise<mongoose.mongo.ObjectId>((resolve, reject) => {
    const stream = bucket.openUploadStream(opts.filename, {
      contentType: opts.contentType,
      metadata: {
        term: new mongoose.Types.ObjectId(opts.termId),
        subject: opts.subject,
        date: opts.date,
        kind: opts.kind,
      },
    });
    stream.on("error", reject);
    stream.on("finish", () => resolve(stream.id as mongoose.mongo.ObjectId));
    stream.end(opts.buffer);
  });

  const [doc] = await (await getBucket()).find({ _id: id }).toArray();
  return serializeFile(doc);
}

export async function listTestFiles(filter: {
  termId: string;
  subject?: string;
  date?: string;
}): Promise<FileMeta[]> {
  const bucket = await getBucket();
  const query: Record<string, any> = {
    "metadata.term": new mongoose.Types.ObjectId(filter.termId),
  };
  if (filter.subject) query["metadata.subject"] = filter.subject;
  if (filter.date) query["metadata.date"] = filter.date;
  const docs = await bucket.find(query).sort({ uploadDate: -1 }).toArray();
  return docs.map(serializeFile);
}

/**
 * 같은 시험지를 여러 회차에서 함께 쓸 때는 파일을 복사하지 않고
 * metadata.aliasOf 로 원본을 가리키는 "참조 파일"을 만든다. (용량 중복 없음)
 */
export async function resolveTestFile(id: string): Promise<any | null> {
  const doc = await findTestFile(id);
  if (!doc) return null;
  const alias = doc.metadata?.aliasOf;
  if (!alias) return doc;
  const origin = await findTestFile(String(alias));
  return origin ? { ...origin, metadata: doc.metadata, aliasFrom: doc._id } : null;
}

export async function findTestFile(id: string): Promise<any | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  const bucket = await getBucket();
  const [doc] = await bucket
    .find({ _id: new mongoose.Types.ObjectId(id) })
    .toArray();
  return doc ?? null;
}

export async function deleteTestFile(id: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(id)) return false;
  const bucket = await getBucket();
  const _id = new mongoose.Types.ObjectId(id);
  try {
    await bucket.delete(_id);
    return true;
  } catch {
    // 참조 파일(chunks 없음)은 파일 문서만 지운다.
    const db = mongoose.connection.db;
    const res = await db?.collection(`${FILE_BUCKET}.files`).deleteOne({ _id });
    return !!res?.deletedCount;
  }
}

export async function openTestFile(id: string) {
  const bucket = await getBucket();
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
}

export { serializeFile };
