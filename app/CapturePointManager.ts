import CapturePoint from './interfaces/CapturePoint';

class CapturePointManager {
  public capturePoints: CapturePoint[] = [];
  public currentPoint: CapturePoint | null = null

  public getAll(): CapturePoint[] {
    return this.capturePoints;
  }

  public add(capturePoint: CapturePoint | CapturePoint[]): void {
    if (Array.isArray(capturePoint)) {
      this.capturePoints.push(...capturePoint);
    } else {
      this.capturePoints.push(capturePoint);
    }
  }

  public getAllDeleteIds(): string[] {
    return this.capturePoints
    .filter(capturePoint => capturePoint.deleteID !== undefined)
    .map(capturePoint => capturePoint.deleteID as string);
  }

  public getAllUrls(): string[] {
    return this.capturePoints
    .filter(capturePoint => capturePoint.url !== undefined)
    .map(capturePoint => capturePoint.url as string);
  }

  public getAllJpgs(): string[] {
    return this.capturePoints
    .filter(capturePoint => capturePoint.photo !== null)
    .map(capturePoint => `image_${capturePoint.index}.jpg`);
  }

  public removeAt(index: number): void {
    this.capturePoints.splice(index, 1);
  }

  public getAt(index: number): CapturePoint | undefined {
    return this.capturePoints[index];
  }

  public nextPoint(){
    if(this.currentPoint == null){
      this.currentPoint = this.capturePoints[1]
    } else if(this.currentPoint.index === this.capturePoints.length){
      this.currentPoint = null
    } else {
      let newIndex = this.currentPoint.index + 1
      this.currentPoint = this.capturePoints[newIndex]
    }
    return this.currentPoint
  }

  public previousPoint(){
    if(this.currentPoint!.index > 0){
      this.currentPoint = this.capturePoints[this.currentPoint!.index - 1]
    }
   return this.currentPoint
  }

  public allCapturePointsComplete(){
    return this.capturePoints.every(point => point.complete);
  }
}

export const capturePointsManager = new CapturePointManager();