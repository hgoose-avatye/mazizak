"""DSP regression fixtures only; no generated audio is written or used in the app."""
from pathlib import Path
import math, random, runpy, unittest
clean=runpy.run_path(str(Path(__file__).with_name('clean-local-keyboard-noise.py')))['clean_clip']
SR=48000

def fixture(second=False):
    rng=random.Random(123);x=[rng.uniform(-.0008,.0008) for _ in range(round(SR*.23))]
    for onset in ([.035,.14] if second else [.035]):
        for i in range(round(onset*SR),len(x)):
            t=i/SR-onset;x[i]+=.1*math.exp(-t/.007)*math.sin(2*math.pi*2600*t)+.015*math.exp(-t/.012)*math.sin(2*math.pi*230*t)
    return x

class Cleanup(unittest.TestCase):
    def test_preserves_main_transient_without_level_boost(self):
        x=fixture();y,meta=clean(x,SR)
        self.assertLess(abs(meta['peakChangeDb']),.1)
        self.assertLess(len(y),len(x)*.65)
        offset=round(meta['trimStartMs']*SR/1000)
        a=round(.035*SR);b=a+round(.01*SR)
        error=sum((x[i]-y[i-offset])**2 for i in range(a,b))
        energy=sum(x[i]**2 for i in range(a,b))
        self.assertLess(error/energy,.0001)
        self.assertEqual(y[0],0);self.assertEqual(y[-1],0)
    def test_keeps_a_separate_second_impact(self):
        x=fixture(True);y,m=clean(x,SR);offset=round(m['trimStartMs']*SR/1000)
        start=round(.14*SR)-offset
        self.assertGreater(max(map(abs,y[start:start+480])),.06)
    def test_silence_and_unreliable_short_clips_are_unchanged(self):
        for x in [[0]*4800,[.02,-.02]*48]:
            y,m=clean(x,SR);self.assertEqual(x,y);self.assertIn('skipped',m)

if __name__=='__main__':unittest.main()
