import unittest,tempfile,json,math
from pathlib import Path
import ezdxf
from import_dxf import extract
from example import sample,write_dxf
class ImportTests(unittest.TestCase):
    def test_sample_matches_dxf_contours(self):
        with tempfile.TemporaryDirectory() as d:
            f=str(Path(d)/'example.dxf');write_dxf(f);parsed=extract(f)
            self.assertEqual(len(parsed['panels']),4)
            for actual,expected in zip(parsed['panels'],sample()['panels']):
                self.assertAlmostEqual(actual['widthMm'],expected['widthMm'],places=3)
                self.assertAlmostEqual(actual['heightMm'],expected['heightMm'],places=3)
                self.assertEqual(len(actual['points']),len(expected['points']))
                self.assertTrue(all(math.dist(a,b)<.001 for a,b in zip(actual['points'],expected['points'])))
    def test_unitless_requires_explicit_units(self):
        with tempfile.TemporaryDirectory() as d:
            doc=ezdxf.new();doc.units=0;doc.modelspace().add_lwpolyline([(0,0),(50,0),(50,70),(0,70)],close=True);f=str(Path(d)/'cm.dxf');doc.saveas(f)
            with self.assertRaisesRegex(ValueError,'senza unità'):extract(f)
            self.assertEqual(extract(f,'cm')['panels'][0]['heightMm'],700)
    def test_nested_blocks_and_bulges(self):
        with tempfile.TemporaryDirectory() as d:
            doc=ezdxf.new();doc.units=4;block=doc.blocks.new('piece');block.add_lwpolyline([(0,0,0),(500,0,.4),(500,700,0),(0,700,0)],format='xyb',close=True);doc.modelspace().add_blockref('piece',(2000,4000));f=str(Path(d)/'block.dxf');doc.saveas(f);result=extract(f);self.assertEqual(len(result['panels']),1);self.assertGreater(len(result['panels'][0]['points']),4)
    def test_elevated_planar_contours_are_kept(self):
        with tempfile.TemporaryDirectory() as d:
            doc=ezdxf.new();doc.units=4;doc.modelspace().add_lwpolyline([(0,0),(500,0),(500,700),(0,700)],close=True,dxfattribs={'elevation':100});f=str(Path(d)/'elevated.dxf');doc.saveas(f)
            self.assertEqual(extract(f)['panels'][0]['heightMm'],700)
    def test_open_lines_are_not_invented_into_a_panel(self):
        with tempfile.TemporaryDirectory() as d:
            doc=ezdxf.new();doc.units=4;doc.modelspace().add_line((0,0),(500,700));f=str(Path(d)/'open.dxf');doc.saveas(f)
            with self.assertRaisesRegex(ValueError,'Nessun contorno'):extract(f)
    def test_dimension_limit_rejects_wrong_units(self):
        with tempfile.TemporaryDirectory() as d:
            f=str(Path(d)/'example.dxf');write_dxf(f)
            with self.assertRaisesRegex(ValueError,'2500'):extract(f,'m')
if __name__=='__main__':unittest.main()
