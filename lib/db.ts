import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** 끊김 감시 리스너를 이미 달았는지 (요청마다 중복으로 달지 않도록) */
  watched?: boolean;
}

// Cache the connection across hot-reloads (dev) and re-requests (serverless/prod)
// so we never open a new connection on every request.
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: MongooseCache | undefined;
}

const cached: MongooseCache =
  global._mongoose || (global._mongoose = { conn: null, promise: null });

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI 환경변수가 설정되지 않았습니다. (.env 또는 Cloudtype 환경변수 확인)"
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      // 무료 티어(M0)는 연결 수·처리량이 제한적이라 풀을 작게 유지한다.
      maxPoolSize: 10,
      minPoolSize: 1,
      // 놀고 있던 소켓을 Atlas/공유기(NAT)가 먼저 끊어 버리면 다음 요청에서
      // ECONNRESET 이 난다. 그 전에 우리가 먼저 정리해 새 소켓으로 바꾼다.
      maxIdleTimeMS: 30_000,
      // 서버를 못 고르거나 응답이 늦을 때 요청이 무한정 매달리지 않도록.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      connectTimeoutMS: 10_000,
      // 끊긴 읽기/쓰기는 드라이버가 한 번 더 시도한다 (일시적 끊김 흡수).
      retryReads: true,
      retryWrites: true,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  // 연결이 끊기면 캐시를 비워, 다음 요청이 죽은 연결을 그대로 쓰지 않게 한다.
  // (요청마다 부르므로 리스너는 한 번만 단다)
  if (!cached.watched) {
    cached.watched = true;
    cached.conn.connection.on("disconnected", () => {
      cached.conn = null;
      cached.promise = null;
      cached.watched = false;
    });
  }

  return cached.conn;
}
