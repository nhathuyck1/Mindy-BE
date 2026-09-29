import Joi from 'joi';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65_535).default(3000),
  CORS_ORIGINS: Joi.string().min(1).required(),
  SWAGGER_ENABLED: Joi.boolean().default(false),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DATABASE_LOGGING: Joi.boolean().default(false),
  COOKIE_SECURE: Joi.boolean().default(true),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(2_592_000),
  JWT_PRIVATE_KEY_BASE64: Joi.string().allow('').default(''),
  JWT_PUBLIC_KEY_BASE64: Joi.string().allow('').default(''),
  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),
  MINIO_ENABLED: Joi.boolean().default(false),
  MINIO_ENDPOINT: Joi.string().hostname().default('localhost'),
  MINIO_PORT: Joi.number().integer().min(1).max(65_535).default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().allow('').default(''),
  MINIO_SECRET_KEY: Joi.string().allow('').default(''),
  MINIO_BUCKET: Joi.string().min(3).default('edtech-center'),
}).unknown(false);
