const clients = new Set();

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write('event: connected\ndata: {"status": "connected"}\n\n');

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

function broadcastEvent(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

module.exports = {
  sseHandler,
  broadcastEvent,
  getClientCount: () => clients.size
};
