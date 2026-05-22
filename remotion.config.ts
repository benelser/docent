import {Config} from '@remotion/cli/config';

// Dark-console films render crisper from JPEG stills; quality stays high.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);

// Remotion is embarrassingly parallel by design: it shards frames across all
// cores. One render of the full film already saturates the machine — do not
// also run scene renders concurrently, that only oversubscribes.
Config.setConcurrency(8);
Config.setChromiumOpenGlRenderer('angle');
