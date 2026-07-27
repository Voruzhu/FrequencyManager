import { runAutoScanSample, type AutoScanStep, type AutoScanStatus } from '../../src/main/autoScan';
import * as windowAutomation from '../../src/main/windowAutomation';

jest.mock('../../src/main/windowAutomation');
const mocked = windowAutomation as jest.Mocked<typeof windowAutomation>;

describe('runAutoScanSample', () => {
    let progress: Array<{ step: AutoScanStep; status: AutoScanStatus; message?: string }>;
    let deps: Parameters<typeof runAutoScanSample>[0];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        progress = [];
        mocked.focusWindow.mockResolvedValue(true);
        mocked.isWindowForeground.mockResolvedValue(true);
        mocked.getWindowRect.mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
        mocked.sendKey.mockResolvedValue(undefined);
        mocked.sendClick.mockResolvedValue(undefined);
        deps = {
            captureScreen: jest.fn().mockResolvedValue('/tmp/fake.png'),
            readRawText: jest.fn().mockResolvedValue('Terminal'),
            onProgress: (step, status, message) => progress.push({ step, status, message }),
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('runs the full happy-path sequence: focus -> detect -> ESC -> wait -> C -> click', async () => {
        const runPromise = runAutoScanSample(deps);
        await jest.runAllTimersAsync();
        await runPromise;

        expect(mocked.focusWindow).toHaveBeenCalledWith('Wuthering Waves');
        expect(deps.captureScreen).toHaveBeenCalledWith('terminal-check');
        expect(mocked.sendKey).toHaveBeenNthCalledWith(1, 'ESC');
        expect(mocked.sendKey).toHaveBeenNthCalledWith(2, 'C');
        expect(mocked.sendClick).toHaveBeenCalledTimes(1);
        // Click target: 3.9%/42.6% of the (0,0,1920,1080) rect.
        const [x, y] = mocked.sendClick.mock.calls[0];
        expect(x).toBeCloseTo(1920 * 0.039, 0);
        expect(y).toBeCloseTo(1080 * 0.426, 0);

        expect(progress.at(-1)).toMatchObject({ step: 'sample-complete', status: 'done' });
        expect(progress.some((p) => p.status === 'error')).toBe(false);
    });

    it('stops without sending any input when the game window cannot be found', async () => {
        mocked.focusWindow.mockResolvedValue(false);
        await runAutoScanSample(deps);

        expect(mocked.sendKey).not.toHaveBeenCalled();
        expect(progress.at(-1)).toMatchObject({ step: 'focus', status: 'error' });
    });

    it('stops without sending any input when the Terminal menu is not detected', async () => {
        (deps.readRawText as jest.Mock).mockResolvedValue('Some other screen entirely');
        const runPromise = runAutoScanSample(deps);
        await jest.runAllTimersAsync();
        await runPromise;

        expect(mocked.sendKey).not.toHaveBeenCalled();
        expect(progress.at(-1)).toMatchObject({ step: 'detect-terminal', status: 'error' });
    });

    it('aborts mid-sequence if the window loses foreground focus (Alt+Tab) during the 2s wait', async () => {
        mocked.isWindowForeground
            .mockResolvedValueOnce(true) // pre-ESC check
            .mockResolvedValueOnce(false); // post-2s-wait check, before pressing C
        const runPromise = runAutoScanSample(deps);
        await jest.runAllTimersAsync();
        await runPromise;

        expect(mocked.sendKey).toHaveBeenCalledTimes(1); // ESC only, never C
        expect(mocked.sendKey).toHaveBeenCalledWith('ESC');
        expect(mocked.sendClick).not.toHaveBeenCalled();
        expect(progress.at(-1)).toMatchObject({ step: 'aborted', status: 'error' });
    });
});
