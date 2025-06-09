import { Action } from './types';

export class MessageHandler {
  private message: { action: Action; data?: any } | null = null;
  private captureComplete: boolean = false;
  private progress: number = 0;

  setMessage(action: Action, data?: any) {
    this.message = { action, data };
  }

  getMessage() {
    return this.message;
  }

  setCaptureComplete(complete: boolean) {
    this.captureComplete = complete;
  }

  isCaptureComplete() {
    return this.captureComplete;
  }

  updateProgress(progress: number) {
    this.progress = progress;
  }

  getProgress() {
    return this.progress;
  }
}

export default MessageHandler; 