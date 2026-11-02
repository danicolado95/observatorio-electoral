import unittest,sys,importlib.util
sys.dont_write_bytecode=True
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('wiki',Path(__file__).resolve().parents[1]/'scripts/importar-wikipedia.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class ImporterTests(unittest.TestCase):
 def fixture(self,rows=None):
  row='<tr><td>GAD3/ABC<sup><a href="#cite_note-1">1</a></sup></td><td>20–21 Jan</td><td>1000</td><td>?</td><td>30.0<br><small>130</small></td><td>28.0</td><td>15.0</td><td>10.0</td></tr>'
  return ('<link rel="license" href="'+w.LICENSE+'deed.en"><a href="?oldid=123">old</a><h4>Voting intention estimates</h4><h5>2024</h5><table class="wikitable"><tr><th>House</th><th>Field</th><th>Sample</th><th>Turnout</th>'+''.join('<th><a title="'+p+'"></a></th>' for p in ['PP','PSOE','Vox','Sumar'])+'</tr><tr></tr>'+ (rows or row)+'</table><h4>Voting preferences</h4><table class="wikitable">'+row+'</table><li id="cite_note-1"><cite><a class="external text" href="https://www.abc.es/encuesta">Encuesta</a>. ABC. 22 January 2024.</cite></li>').encode()
 def test_section_and_real_dates(self):
  data=w.parse(self.fixture(),'2024-01-22')
  self.assertEqual(data['report']['rows_read'],1)
  self.assertEqual(data['encuestas'][0]['fecha_publicacion'],'2024-01-22')
  self.assertEqual(data['encuestas'][0]['trabajo_campo_fin'],'2024-01-21')
  self.assertEqual(data['encuestas'][0]['resultados']['PP'],30)
 def test_duplicates_collapse_conflicts_quarantine(self):
  raw=self.fixture(); row=raw.decode().split('<tr><td>')[1].split('</tr>')[0]; row='<tr><td>'+row+'</tr>'
  self.assertEqual(w.parse(self.fixture(row+row),'2024-01-22')['report']['duplicates_removed'],1)
  data=w.parse(self.fixture(row+row.replace('30.0','31.0')),'2024-01-22')
  self.assertEqual(len(data['encuestas']),0);self.assertEqual(len(data['quarantine']),2)
 def test_cis_and_future_quarantined(self):
  self.assertEqual(len(w.parse(self.fixture().replace(b'GAD3/ABC',b'CIS/ABC'),'2024-01-22')['encuestas']),0)
  self.assertEqual(len(w.parse(self.fixture(),'2024-01-21')['encuestas']),0)
 def test_optional_sample_preserved_null(self):
  data=w.parse(self.fixture().replace(b'<td>1000</td>',b'<td>?</td>'),'2024-01-22')
  self.assertIsNone(data['encuestas'][0]['tamano_muestra'])
 def test_fail_closed_unknown_header_license(self):
  with self.assertRaises(ValueError): w.parse(self.fixture().replace(b'title="PP"',b'title="Unknown"'),'2024-01-22')
  with self.assertRaises(ValueError): w.parse(self.fixture().replace(b'rel="license"',b'rel="other"'),'2024-01-22')
 def node(self,s): return next(w.Parser(s).root.all('td'))
 def test_votes_not_seats(self):
  self.assertEqual(w.percentage(self.node('<td><b>31.5</b><br><span style="font-size:75%">133</span></td>')),31.5)
 def test_missing_not_zero(self):
  self.assertIsNone(w.percentage(self.node('<td>?<br><small>20</small></td>')))
  self.assertIsNone(w.percentage(self.node('<td>–</td>')))
  self.assertEqual(w.percentage(self.node('<td>0.0</td>')),0)
 def test_cross_month(self): self.assertEqual(w.field_dates('31 Jul–7 Aug',2023),('2023-07-31','2023-08-07'))
 def test_cross_year(self): self.assertEqual(w.field_dates('28 Dec–3 Jan',2024),('2023-12-28','2024-01-03'))
 def test_invalid_field(self): self.assertEqual(w.field_dates('31–32 Feb',2024),(None,None))
 def test_single_field_not_publication(self):
  self.assertEqual(w.field_dates('7 Aug',2023),('2023-08-07','2023-08-07'))
  self.assertIsNone(w.citation(w.Parser('<li><cite>Sin fecha</cite></li>').root.all('li').__next__())['fecha_publicacion'])
 def test_citation_publication_not_retrieval(self):
  n=next(w.Parser('<li id="ref"><cite><a class="external text" href="https://example.org">"Encuesta 23 July 2023"</a>. Medio. 4 September 2023. Retrieved 5 October 2024.</cite></li>').root.all('li'))
  self.assertEqual(w.citation(n)['fecha_publicacion'],'2023-09-04')
 def test_retrieval_only_not_publication(self):
  n=next(w.Parser('<li><cite><a class="external text" href="https://example.org">Encuesta</a>. Retrieved 5 October 2024.</cite></li>').root.all('li'))
  self.assertIsNone(w.citation(n)['fecha_publicacion'])
 def test_rowspan_colspan(self):
  n=next(w.Parser('<table><tr><td rowspan="2">House</td><td colspan="2">10</td></tr><tr><td>20</td><td>30</td></tr></table>').root.all('table'))
  rows=list(w.grid(n));self.assertEqual([w.text(c) for c in rows[1][1]],['House','20','30'])
  self.assertIs(rows[0][1][1],rows[0][1][2])
 def test_real_snapshot(self):
  path=Path(__file__).resolve().parents[1]/'data/pipeline-test/wikipedia/staging.json'
  if not path.exists(): self.skipTest('Sin original local: ejecutar primero importador')
  import json
  data=json.loads(path.read_text(encoding='utf8'))
  self.assertGreater(len(data['encuestas']),200)
  self.assertEqual(len(data['encuestas'])+len(data['quarantine'])+data['report']['duplicates_removed'],data['report']['rows_read'])
  self.assertEqual(len(set(p['estudio_id'] for p in data['encuestas'])),len(data['encuestas']))
  for p in data['encuestas']:
   self.assertGreaterEqual(p['trabajo_campo_fin'],'2023-07-23')
   self.assertGreaterEqual(p['fecha_publicacion'],p['trabajo_campo_fin'])
   self.assertNotIn('electografica.com',p['fuente'])
   self.assertEqual(p['quarantine_reasons'],[])
if __name__=='__main__': unittest.main()
