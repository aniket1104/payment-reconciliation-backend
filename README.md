# ScanPay Backend

Production-grade Node.js backend with TypeScript and Express.js.

## Features

- **TypeScript** - Type-safe development
- **Express.js** - Fast, unopinionated web framework
- **Jest & Supertest** - Testing framework with API testing
- **ESLint & Prettier** - Code quality and formatting
- **Winston** - Professional logging
- **Zod** - Runtime validation
- **Security** - Helmet, CORS, Rate Limiting, HPP
- **Production Ready** - Graceful shutdown, error handling

## Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Route controllers
│   ├── middlewares/    # Express middlewares
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── types/          # TypeScript types
│   ├── utils/          # Utility functions
│   ├── app.ts          # Express app setup
│   └── index.ts        # Entry point
├── __tests__/          # Test files
│   ├── setup.ts        # Jest setup
│   ├── app.test.ts     # App tests
│   ├── health.test.ts  # Health endpoint tests
│   ├── utils/          # Utility tests
│   └── services/       # Service tests
├── .eslintrc.json      # ESLint config
├── .prettierrc         # Prettier config
├── jest.config.js      # Jest config
├── nodemon.json        # Nodemon config
├── tsconfig.json       # TypeScript config
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy environment file:

```bash
cp env.example .env
```

4. Start development server:

```bash
npm run dev
```

## Scripts

| Script                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start development server with hot reload |
| `npm run build`         | Build for production                     |
| `npm start`             | Start production server                  |
| `npm test`              | Run tests                                |
| `npm run test:watch`    | Run tests in watch mode                  |
| `npm run test:coverage` | Run tests with coverage                  |
| `npm run lint`          | Check for linting errors                 |
| `npm run lint:fix`      | Fix linting errors                       |
| `npm run format`        | Format code with Prettier                |
| `npm run typecheck`     | Check TypeScript types                   |

## API Endpoints

### Health Check

- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/ready` - Readiness check (dependencies)
- `GET /api/v1/health/live` - Liveness check

### Root

- `GET /` - API information

## Environment Variables

| Variable                  | Default     | Description                |
| ------------------------- | ----------- | -------------------------- |
| `NODE_ENV`                | development | Environment mode           |
| `PORT`                    | 3000        | Server port                |
| `HOST`                    | localhost   | Server host                |
| `API_PREFIX`              | /api/v1     | API route prefix           |
| `CORS_ORIGIN`             | \*          | CORS allowed origins       |
| `RATE_LIMIT_WINDOW_MS`    | 900000      | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | 100         | Max requests per window    |
| `LOG_LEVEL`               | debug       | Logging level              |

## Testing

Run all tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Security Features

- **Helmet** - Sets security HTTP headers
- **CORS** - Cross-Origin Resource Sharing
- **Rate Limiting** - Prevents brute force attacks
- **HPP** - HTTP Parameter Pollution prevention
- **Input Validation** - Zod schema validation

## Error Handling

The app uses a centralized error handling approach:

- `AppError` class for operational errors
- Global error handler middleware
- Async handler wrapper for route handlers

## Logging

Winston logger with:

- Console output (colorized in development)
- File output in production (`logs/error.log`, `logs/combined.log`)
- Request logging via Morgan

## License

MIT
