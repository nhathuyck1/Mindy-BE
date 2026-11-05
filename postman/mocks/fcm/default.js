const http = require('node:http');
// Test-only token names choose documented provider failures. No real tokens or credentials.
http
  .createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/projects/mindy-test/messages:send') {
      res.writeHead(501);
      res.end();
      return;
    }
    const body = req.body;
    const message = body?.message;
    if (
      req.headers.authorization !== 'Bearer simulation-only' ||
      !message ||
      message.notification?.title !== 'Tin nhắn mới' ||
      Object.keys(message.data ?? {})
        .sort()
        .join(',') !== 'notificationId,schemaVersion' ||
      message.webpush?.fcm_options?.link !== 'https://app.example.test/notifications' ||
      'fcmOptions' in message.webpush
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', code: 400 } }));
      return;
    }
    const status = Number(message.token.replace('simulate-', '')) || 200;
    const errors = {
      400: 'INVALID_ARGUMENT',
      403: 'PERMISSION_DENIED',
      404: 'NOT_FOUND',
      429: 'RESOURCE_EXHAUSTED',
      503: 'UNAVAILABLE',
    };
    const response =
      status === 200
        ? { name: 'projects/mindy-test/messages/simulated' }
        : {
            error: {
              code: status,
              status: errors[status],
              ...(status === 404
                ? {
                    details: [
                      {
                        '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                        errorCode: 'UNREGISTERED',
                      },
                    ],
                  }
                : {}),
            },
          };
    res.writeHead(status, {
      'Content-Type': 'application/json',
      ...(status === 503 ? { 'Retry-After': '90' } : {}),
    });
    res.end(JSON.stringify(response));
  })
  .listen(process.env.PORT || 14970);
