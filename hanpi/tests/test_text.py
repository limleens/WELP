from hanpi_core.text import clean_hanzi, get_syllables

def test_clean_hanzi():
    assert clean_hanzi("Hello, 你好！我是中国人123") == "你好我是中国人"
    assert len(clean_hanzi("中国" * 20)) == 8

def test_nihao_sandhi():
    items = get_syllables("你好")
    assert [x.expected_tone for x in items] == [2, 3]
    assert items[0].written_pinyin == "nǐ"
    assert items[0].spoken_pinyin == "ní"

def test_empty():
    assert get_syllables("abc") == []
