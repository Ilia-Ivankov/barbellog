import dotenv from "dotenv";

dotenv.config();

interface EnvironmentConfig {
  PORT: number;
  SQLITE_PATH: string;
  JWT_SECRET: string;
  FRONTEND_ORIGIN: string;
}

const ENV: EnvironmentConfig = {
  PORT: Number.parseInt(process.env.PORT ?? '3000', 10),
  SQLITE_PATH: process.env.SQLITE_PATH ?? './data/barbellog.sqlite',
  JWT_SECRET: process.env.JWT_SECRET ?? 'development-only-change-me',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
};

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export default ENV;
