import { AsyncLocalStorage } from "node:async_hooks";

export interface GenerationContext {
  userId?: string;
  operation: string;
  requestId?: string;
  knowledgeDocumentIds?: string[];
}

const generationContext = new AsyncLocalStorage<GenerationContext>();

export function runWithGenerationContext<T>(context: GenerationContext, action: () => Promise<T>): Promise<T> {
  return generationContext.run(context, action);
}

export function getGenerationContext() {
  return generationContext.getStore();
}
