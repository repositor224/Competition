import unittest
from src.replay import build_replay


class ReplayTests(unittest.TestCase):
    def test_altercation_requires_multiple_readings(self):
        result = build_replay('altercation')
        self.assertTrue(all(f['status'] == 'NORMAL' for f in result['frames'][:3]))
        self.assertEqual(result['frames'][3]['status'], 'POSSIBLE_ALTERCATION')

    def test_distress_waits_for_inactivity(self):
        result = build_replay('distress')
        self.assertTrue(all(f['status'] == 'NORMAL' for f in result['frames'][:-1]))
        self.assertEqual(result['frames'][-1]['status'], 'POSSIBLE_DISTRESS')

    def test_negative_controls_do_not_alert(self):
        for name in ['normal', 'benign_loud', 'vape_only']:
            with self.subTest(name=name):
                result = build_replay(name)
                self.assertTrue(all(f['status'] == 'NORMAL' for f in result['frames']))

    def test_missing_data_is_not_hidden_by_later_valid_readings(self):
        result = build_replay('missing_data')
        self.assertEqual(result['frames'][0]['status'], 'NORMAL')
        self.assertTrue(all(f['status'] == 'DATA_UNAVAILABLE' for f in result['frames'][1:]))

    def test_unknown_scenario_is_rejected(self):
        with self.assertRaises(ValueError):
            build_replay('../app.py')


if __name__ == '__main__':
    unittest.main()
