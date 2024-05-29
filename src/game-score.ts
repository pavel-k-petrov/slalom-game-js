import { GateCollision, GateCollisionType } from "collision-system";

export class GameScore {
    public turnNumber: number = 0;
    public gateScore: { gateNumber: number, score: number }[] = [];
    public isFinished: boolean;
    private touchedGateNumber?: number;
    constructor(private gateCount: number) { }

    public MoveTurn(finishCrossing: number, collisions: GateCollision[]): GateCollision[] {
        if (this.isFinished) {
            return [];
        }

        const newCollisions: GateCollision[] = [];

        if (finishCrossing) {
            this.turnNumber += finishCrossing;
            newCollisions.push(...this.setScoreForMissedGates(this.gateCount + 1));
            this.isFinished = true;
        } else {
            this.turnNumber += 1;
        }

        collisions.forEach(c => {
            if (this.gateScore.find(x => x.gateNumber === c.gateNumber)) {
                return;
            }

            if (this.touchedGateNumber && this.touchedGateNumber < c.gateNumber) {
                this.touchedGateNumber = undefined;
            }

            newCollisions.push(...this.setScoreForMissedGates(c.gateNumber));
            newCollisions.push(c);

            if (!c.types.has('WrongDirection') && !c.types.has('Pass')) {
                this.touchedGateNumber = c.gateNumber;
                return;
            }

            let score = 0;
            if (c.types.has('WrongDirection')) {
                score = 50;
            } else if (this.touchedGateNumber === c.gateNumber || c.types.has('TouchLeft') || c.types.has('TouchRight')) {
                score = 2;
            }
            this.touchedGateNumber = undefined;
            this.gateScore.push({ gateNumber: c.gateNumber, score });
        });

        return newCollisions;
    }
    private setScoreForMissedGates(gateNumber: number): GateCollision[] {
        const collisions: GateCollision[] = []

        for (let i = 1; i < gateNumber; i++) {
            if (!this.gateScore.find(x => x.gateNumber === i)) {
                this.gateScore.push({ gateNumber: i, score: 50 });
                collisions.push({
                    gateNumber: i,
                    types: new Set<GateCollisionType>(['WrongDirection']),
                });
            }
        }

        return collisions;
    }
}

export class GameScoreVisualization {
    public static Visualize(svg: Snap.Paper, score: GameScore) {
        const penalty = score.gateScore?.reduce((sum, x) => sum + x.score, 0) ?? 0;
        const statusText = `Ходов: ${score.turnNumber.toLocaleString(undefined, {maximumFractionDigits: 2})}, Штраф: ${penalty}${score.isFinished ? ', Финиш!' : ''}`;
        svg.select('#finished-label text').attr({ text: statusText });
    }
}