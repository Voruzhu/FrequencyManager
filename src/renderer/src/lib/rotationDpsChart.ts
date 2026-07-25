export interface DpsChartPoint { t: number; cumulative: number }

/** Cumulative damage over the rotation's timeline, from each step's elapsed start time + its damage. */
export function cumulativeDamageSeries(elapsed: number[], results: Array<{ damage: number }>): DpsChartPoint[] {
    let running = 0;
    const points: DpsChartPoint[] = [{ t: 0, cumulative: 0 }];
    for (let i = 0; i < results.length; i++) {
        running += results[i].damage;
        points.push({ t: elapsed[i] ?? 0, cumulative: running });
    }
    return points;
}
