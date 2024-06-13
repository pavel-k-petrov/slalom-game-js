import { GateCollision, GateCollisionType } from "collision-system";

export class GameScore {
    public turnNumber: number = 0;
    public gateScore: { gateNumber: number, score: number }[] = [];
    public isFinished: boolean;
    private touch?: { gateNumber: number, types: Set<GateCollisionType> };
    constructor(private gateCount: number) { }

    public getNextGate(): number | 'finish' {
        const maxScoredGateNumber = this.gateScore.reduce((n, x) => Math.max(x.gateNumber, n), 0);
        if (maxScoredGateNumber >= this.gateCount) {
            return 'finish';
        }

        return maxScoredGateNumber + 1;
    }

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

            if (this.touch && this.touch.gateNumber < c.gateNumber) {
                this.touch = undefined;
            }

            newCollisions.push(...this.setScoreForMissedGates(c.gateNumber));
            if (this.IsSetHasAny(c.types, 'TouchLeft', 'TouchRight')) {
                newCollisions.push(c);
            }

            // прошли если Pass или WrongDirection и не было TouchOn в другую сторону
            // если Pass или WrongDirection и был TouchOn в другую сторону убираем этот TouchOn

            if (this.IsSetHasAny(c.types, 'TouchLeft', 'TouchRight', 'StayTouchingLine', 'TouchOnPass', 'TouchOnWrongDirection')
                || c.types.has('Pass') && this.touch && this.touch.types.has('TouchOnWrongDirection')
                || c.types.has('WrongDirection') && this.touch && this.touch.types.has('TouchOnPass')
            ) {
                const touch = this.touch ?? { gateNumber: c.gateNumber, types: new Set<GateCollisionType>() };
                c.types.forEach(x => touch.types.add(x));
                if (c.types.has('Pass')) { touch.types.delete('TouchOnWrongDirection'); }
                if (c.types.has('WrongDirection')) { touch.types.delete('TouchOnPass'); }
                this.touch = touch;
                return;
            }

            if (this.IsSetHasAny(c.types, 'WrongDirection', 'Pass')) {
                newCollisions.push(c);
            }

            let score = 0;
            if (c.types.has('WrongDirection')) {
                score = 50;
            } else if (
                this.touch &&
                this.touch.gateNumber === c.gateNumber &&
                this.IsSetHasAny(this.touch.types, 'TouchLeft', 'TouchRight') ||
                this.IsSetHasAny(c.types, 'TouchLeft', 'TouchRight')) {
                score = 2;
            }
            this.touch = undefined;
            this.gateScore.push({ gateNumber: c.gateNumber, score });
        });

        return newCollisions;
    }

    private IsSetHasAny<T>(set: Set<T>, ...items: T[]): boolean { return items.some(x => set.has(x)); };

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
        const statusText = `Ходов: ${score.turnNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })}, Штраф: ${penalty}${score.isFinished ? ', Финиш!' : ''}`;
        svg.select('#finished-label text').attr({ text: statusText });
    }
}