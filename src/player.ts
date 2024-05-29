import { Circle, Point, Segment, circle, point } from "@flatten-js/core";
import { CollisionSystem } from "./collision-system";

export class PossibleTarget {
    centerX: number = 0;
    centerY: number = 0;
    radius: number = 0;
    limitX: number = 0;
    limitY: number = 0;
    limitRadius: number = 0;


    limitByTarget(
        x: number | undefined,
        y: number | undefined
    ): Point {
        if (x === undefined || y === undefined) {
            return undefined;
        }

        const possibleChange = this.limitByCircle(
            x,
            y,
            this.centerX,
            this.centerY,
            this.radius
        );

        const limitedByMaxSpeed = this.limitByCircle(
            possibleChange.x,
            possibleChange.y,
            this.limitX,
            this.limitY,
            this.limitRadius
        );

        return limitedByMaxSpeed;
    }

    private limitByCircle(
        x: number,
        y: number,
        circleX: number,
        circleY: number,
        circleR: number
    ): Point {
        const deltaX = x - circleX;
        const deltaY = y - circleY;
        const r = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (r <= circleR) {
            return point(x, y);
        }

        return point(circleX + (deltaX * circleR) / r, circleY + (deltaY * circleR) / r);
    }
}

export class Player {
    x: number = 0;
    y: number = 0;
    r: number = 15;
    speedX: number = 0;
    speedY: number = 0;

    static speedChangeMax = 100;
    static speedLimit = 300;

    constructor(private collisionSystem: CollisionSystem, initialPosition?: Segment) {
        if (initialPosition) {
            this.x = initialPosition.ps.x;
            this.y = initialPosition.ps.y;
        }
    }

    head():Circle{
        return circle(point(this.x, this.y), this.r);
    }

    calculateTarget(): PossibleTarget {
        const flow = this.collisionSystem.GetFlowDirectionAt(this.x, this.y);
        return Object.assign(new PossibleTarget(),
            {
                centerX: this.x + this.speedX + flow.vx,
                centerY: this.y + this.speedY + flow.vy,
                radius: Player.speedChangeMax,
                limitX: this.x + flow.vx,
                limitY: this.y + flow.vy,
                limitRadius: Player.speedLimit,
            });
    }

    moveTo(newX: number, newY: number): Player {
        const target = this.calculateTarget();
        const inTarget = target.limitByTarget(newX, newY);
        const flowStart = this.collisionSystem.GetFlowDirectionAt(this.x, this.y);
        if (inTarget.x === undefined || inTarget.y === undefined) {
            return;
        }
        const collision = this.collisionSystem.GetBorderCollision(this.head(), inTarget);
        const result = new Player(this.collisionSystem, undefined);
        if (collision) {
            Object.assign(result, {
                x: collision.x,
                y: collision.y,
                speedX: 0,
                speedY: 0,
            });
        } else {
            // const flowFinish = collisionSystem.GetFlowDirectionAt(inTarget.x, inTarget.y);
            Object.assign(result, {
                x: inTarget.x,
                y: inTarget.y,
                speedX: inTarget.x - this.x - flowStart.vx,
                speedY: inTarget.y - this.y - flowStart.vy,
            });
        }

        return result;
    }
}