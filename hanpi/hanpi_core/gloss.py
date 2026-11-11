"""Tiny offline glosses for the built-in sample vocabulary.

Not a translation engine: unknown text must be glossed by the user before saving.
"""

GLOSSES = {
    "你好": "Hello", "你": "You", "好": "Good; well",
    "中国": "China", "中": "Middle; central", "国": "Country; nation",
    "谢谢": "Thank you", "谢": "To thank", "妈妈": "Mom; mother",
    "妈": "Mom", "汉字": "Chinese characters", "汉": "Chinese (language / ethnicity)",
    "字": "Written character", "学习": "To study; to learn",
    "学": "To study", "习": "To practise", "麻": "Hemp; numb",
    "马": "Horse", "骂": "To scold", "是": "To be; yes",
    "我": "I; me", "爱": "To love", "吃": "To eat", "饭": "Cooked rice; meal",
}


def meaning_for(hanzi: str) -> str:
    return GLOSSES.get(hanzi or "", "")
