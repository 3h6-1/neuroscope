// This worker is constructed only after the explicit local-model load action.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = message => handler.onmessage(message);
