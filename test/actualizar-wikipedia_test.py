import unittest, importlib.util, tempfile, json, sys
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('daily',Path(__file__).resolve().parents[1]/'scripts/actualizar-wikipedia.py')
daily=importlib.util.module_from_spec(spec);spec.loader.exec_module(daily)

class DailyTests(unittest.TestCase):
 def test_failure_restores_all_snapshots(self):
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp);source=target/'input.html';source.write_text('<html>invalid</html>')
   names=['staging.json','radar.json','report.json']
   for name in names:(target/name).write_bytes(b'original '+name.encode())
   before={name:(target/name).read_bytes() for name in names}
   def failure(*args,**kwargs):
    (target/'staging.json').write_text('broken');raise RuntimeError('parser failed')
   with patch.object(daily,'TARGET',target),patch.object(daily.subprocess,'run',side_effect=failure):
    with self.assertRaises(RuntimeError):daily.update(str(source))
   self.assertEqual(before,{name:(target/name).read_bytes() for name in names})
   self.assertFalse((target/'daily.lock').exists())

 def test_missing_contact_never_requests_network(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(daily,'TARGET',Path(tmp)),patch.object(daily,'urlopen') as network:
   with self.assertRaises(ValueError):daily.update()
   network.assert_not_called()

 def test_conflicting_history_is_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp);source=target/'input.html';source.write_text('fixture')
   old={'encuestas':[{'estudio_id':'x','resultados':{'PP':10}}]}
   snapshot=json.dumps(old).encode();(target/'staging.json').write_bytes(snapshot)
   def parse(*args,**kwargs):
    new={'encuestas':[{'estudio_id':'x','resultados':{'PP':90}}],'report':{}}
    (target/'staging.json').write_text(json.dumps(new))
   with patch.object(daily,'TARGET',target),patch.object(daily.subprocess,'run',side_effect=parse):
    with self.assertRaisesRegex(ValueError,'Conflicto histórico'):daily.update(str(source))
   self.assertEqual((target/'staging.json').read_bytes(),snapshot)
 def test_gad3_revision_is_archived_without_changing_history(self):
  evidence=json.loads((daily.ROOT/'docs/evidencia-reconciliacion/gad3-20261109.json').read_text(encoding='utf8'))
  old=evidence['anterior']
  variant={**evidence['variante'],'quarantine_reasons':[]}
  with tempfile.TemporaryDirectory() as tmp:
   target=Path(tmp);source=target/'input.html';source.write_text('fixture')
   (target/'staging.json').write_text(json.dumps({'encuestas':[old]}),encoding='utf8')
   def parse(*args,**kwargs):
    if '--html' in args[0]:
     staging={'encuestas':[variant],'quarantine':[],'report':{}}
     (target/'staging.json').write_text(json.dumps(staging),encoding='utf8')
   with patch.object(daily,'TARGET',target),patch.object(daily.subprocess,'run',side_effect=parse):
    daily.update(str(source),as_of='2026-11-09')
   staging=json.loads((target/'staging.json').read_text(encoding='utf8'))
   self.assertEqual(staging['encuestas'],[old])
   self.assertEqual(staging['quarantine'][0]['resultados'],variant['resultados'])
   self.assertFalse(daily.variante_gad3(old,{**variant,'resultados':{'PP':99}}))
if __name__=='__main__':unittest.main()
