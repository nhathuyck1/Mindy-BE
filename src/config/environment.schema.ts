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
  JWT_PRIVATE_KEY_BASE64: Joi.string()
    .allow('')
    .default('')
    // biome-ignore lint/suspicious/noThenProperty: Joi conditional schemas use the then key intentionally.
    .when('NODE_ENV', { is: 'production', then: Joi.string().min(1).required() }),
  JWT_PUBLIC_KEY_BASE64: Joi.string()
    .allow('')
    .default('')
    // biome-ignore lint/suspicious/noThenProperty: Joi conditional schemas use the then key intentionally.
    .when('NODE_ENV', { is: 'production', then: Joi.string().min(1).required() }),
  GOOGLE_AUTH_ENABLED: Joi.boolean().default(false),
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_REDIRECT_URI: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  GOOGLE_OAUTH_STATE_TTL_SECONDS: Joi.number().integer().positive().max(900).default(600),
  REGISTRATION_INTENT_TTL_SECONDS: Joi.number().integer().positive().max(3600).default(900),
  FRONTEND_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3001'),
  GOOGLE_REGISTRATION_PATH: Joi.string()
    .pattern(/^\/(?!\/)/)
    .default('/register/complete'),
  GOOGLE_AUTH_SUCCESS_PATH: Joi.string()
    .pattern(/^\/(?!\/)/)
    .default('/'),
  GOOGLE_AUTH_ERROR_PATH: Joi.string()
    .pattern(/^\/(?!\/)/)
    .default('/login'),
  MAIL_ENABLED: Joi.boolean().default(false),
  SMTP_HOST: Joi.string().hostname().default('localhost'),
  SMTP_PORT: Joi.number().integer().min(1).max(65_535).default(1025),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().min(3).default('Mindy Center <no-reply@mindy.local>'),
  EMAIL_VERIFICATION_TTL_SECONDS: Joi.number().integer().positive().max(86_400).default(1800),
  EMAIL_RESEND_COOLDOWN_SECONDS: Joi.number().integer().positive().max(3600).default(60),
  EMAIL_VERIFICATION_PATH: Joi.string()
    .pattern(/^\/(?!\/)/)
    .default('/verify-email'),
  APP_TIME_ZONE: Joi.string()
    .custom((value: string, helpers) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: value });
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .default('Asia/Ho_Chi_Minh'),
  ORDER_PAYOS_HOLD_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(900),
  ORDER_CASH_HOLD_TTL_SECONDS: Joi.number().integer().min(60).max(2_592_000).default(172_800),
  ORDER_EXPIRY_JOB_ENABLED: Joi.boolean().default(true),
  ORDER_EXPIRY_JOB_INTERVAL_SECONDS: Joi.number().integer().min(5).max(3600).default(60),
  SEED_ADMIN_EMAIL: Joi.string().email().allow('').default(''),
  SEED_ADMIN_PASSWORD: Joi.string().allow('').default(''),
  SEED_ADMIN_DISPLAY_NAME: Joi.string().allow('').default(''),
  SEED_ADMIN_CONFIRM: Joi.string().valid('YES', '').default(''),
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
  MINIO_BUCKET: Joi.string().min(3).default('mindy-center'),
}).unknown(true);
