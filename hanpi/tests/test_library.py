"""Offline starred library regression tests."""
import pytest
from hanpi_core.library import save_entry, get_entry, list_entries, delete_entry, mark_practiced


def test_save_and_reopen(tmp_path):
    db = tmp_path / "library.sqlite3"
    item = save_entry("word", "你好", "Hello", db_path=db)
    assert db.is_file()
    loaded = get_entry(item.id, db_path=db)
    assert loaded.hanzi == "你好"
    assert loaded.written_pinyin == "nǐ hǎo"
    assert loaded.spoken_pinyin == "ní hǎo"
    assert loaded.meaning == "Hello"


def test_dedup_and_independent_kinds(tmp_path):
    db = tmp_path / "library.sqlite3"
    first = save_entry("word", "你好", "Hello", db_path=db)
    sentence = save_entry("sentence", "你好", "Greeting", db_path=db)
    mark_practiced(first.id, db_path=db)
    updated = save_entry("word", "你好", "Hi", db_path=db)
    assert first.id == updated.id
    assert first.id != sentence.id
    assert len(list_entries(db_path=db)) == 2
    assert get_entry(first.id, db_path=db).practice_count == 1
    assert get_entry(first.id, db_path=db).meaning == "Hi"


def test_delete_persists(tmp_path):
    db = tmp_path / "library.sqlite3"
    first = save_entry("word", "妈", "Mom", db_path=db)
    second = save_entry("word", "马", "Horse", db_path=db)
    assert delete_entry(first.id, db_path=db)
    assert get_entry(first.id, db_path=db) is None
    assert get_entry(second.id, db_path=db).hanzi == "马"


@pytest.mark.parametrize("kind, hanzi, meaning", [
    ("other", "你好", "Hello"), ("word", "", "Empty"),
    ("word", "English", "Not Hanzi"), ("word", "你好", ""),
    ("word", "妈妈妈妈妈妈妈妈妈", "Too long"),
    ("word", "你 <script>", "Unsafe"),
])
def test_reject_bad_inputs(tmp_path, kind, hanzi, meaning):
    with pytest.raises(ValueError):
        save_entry(kind, hanzi, meaning, db_path=tmp_path / "bad.sqlite3")
