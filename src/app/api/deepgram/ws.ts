import type { NextApiRequest } from 'next';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
export const config = {
  api: { bodyParser: false },
};

const DG_URL =
  'wss://api.deepgram.com/v1/listen?' +
  'encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true';

export default function handler(req: NextApiRequest, res: any) {
  const server = res.socket.server;

  if (!server.dgWss) {
    const wss = new WebSocketServer({ noServer: true });
    server.on(
        'upgrade',
        (request: IncomingMessage, socket: Socket, head: Buffer) => {
          if (request.url === '/api/deepgram/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          }
        }
    );
    wss.on('connection', (clientWs: WebSocket) => {
      const dgWs = new WebSocket(DG_URL, {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        },
      });

      // Browser → Deepgram
      clientWs.on('message', (msg: WebSocket.RawData) => {
        if (dgWs.readyState === WebSocket.OPEN) {
          dgWs.send(msg);
        }
      });

      // Deepgram → Browser
      dgWs.on('message', (msg: WebSocket.RawData) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(msg);
        }
      });

      clientWs.on('close', () => dgWs.close());
      dgWs.on('close', () => clientWs.close());
    });

    server.dgWss = wss;
  }

  res.end();
}
