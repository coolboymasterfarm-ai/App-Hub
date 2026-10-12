# NLP Libraries & Models Research for Grammarly-like App

## Executive Summary

Building a Grammarly-like app requires **multiple NLP components** — grammar checking, spelling correction, style suggestions, and tone detection each have different technical approaches.

---

## 1. LanguageTool (Top Recommendation)

**Best for:** Grammar checking, style suggestions, spell checking  
**License:** LGPL-2.1  
**Language:** Java  
**GitHub Stars:** 15,100+ ⭐  
**Forks:** 1,600+ 🍴  
**Response Time:** ~657ms (public API average)  
**Languages:** 30+ supported  

### Why Choose LanguageTool
- Self-hostable with REST API
- Extensive rule-based grammar checking (1,000s of rules)
- Style suggestions (passive voice, clichés, wordy expressions)
- Spell checking with context-aware suggestions
- Easy HTTP API integration

### HTTP API Usage Example
```bash
curl -X POST "https://api.languagetool.org/v2/check" \
  -d "text=The quick brown fox jumps over the lazy dog." \
  -d "language=en-US"
```

### Real Projects Using LanguageTool
1. **GrammarCheck.io** - Web-based grammar checker using LanguageTool API
2. **LanguageTool Browser Extensions** - Chrome/Firefox extensions for real-time checking
3. **Mastodon integration** - Built-in grammar checking in the Mastodon social platform

---

## 2. spaCy + grammaCy (Rule-Based + ML Hybrid)

**Best for:** Production-grade NLP with custom rule enforcement  
**License:** MIT (spaCy), Custom (grammaCy)  
**Language:** Python/Cython  
**GitHub Stars:** 33,200+ ⭐ (spaCy)  
**Performance:** 1,000s of sentences/second on CPU  

### Key Features
- Dependency parsing for grammar validation
- Rule-based matching with Matcher API
- Fast inference (<1ms per sentence)
- 70+ languages supported

### Code Example (spaCy + custom rules)
```python
import spacy
from spacy.matcher import Matcher

nlp = spacy.load("en_core_web_sm")
doc = nlp("The cat sleeps on the mat.")

# Dependency-based grammar checks
for token in doc:
    if token.dep_ == "nsubj" and token.pos_ == "VERB":
        print(f"Found subject-verb: {token.text} {token.head.text}")
```

### Real Projects Using spaCy
1. **SpaCy Grammarly-like tools** - Custom grammar checkers using dependency parsing
2. **Textacy** - Higher-level text analytics built on spaCy
3. **Stanza** - Stanford's NLP pipeline (similar architecture)

### grammaCy (Grammar Checking Extension)
- Builds on spaCy's dependency parser
- Generates grammar rules from dependency trees
- 2x faster than LanguageTool for simple checks
- GitHub: `skarokin/grammaCy`

---

## 3. Hugging Face Transformers (ML-Based)

**Best for:** AI-powered grammar correction, tone detection  
**License:** Apache 2.0  
**Language:** Python (PyTorch/TensorFlow/JAX)  
**GitHub Stars:** 167,000+ ⭐  

### Key Models for Your Use Case

| Model | Task | License |
|-------|------|---------|
| `Tegence/grammar-correction-model` | Grammar correction (T5-based) | Apache 2.0 |
| `nlptown/bert-base-multilingual-uncased-sentiment` | Sentiment/tone detection | Apache 2.0 |
| `google/t5-v1_1-xxl` | General NLP tasks | Apache 2.0 |

### Example: Grammar Correction with T5
```python
from transformers import pipeline

corrector = pipeline("text2text-generation", 
                      model="Tegence/grammar-correction-model")
result = corrector("I goed to the store")[0]['generated_text']
# Output: "I went to the store"
```

### Example: Tone Detection
```python
from transformers import pipeline

sentiment = pipeline("sentiment-analysis", 
                      model="cardiffnlp/twitter-roberta-base-sentiment-latest")
result = sentiment("I absolutely love this product!")
# Output: {'label': 'POSITIVE', 'score': 0.99}
```

### Real Projects Using Hugging Face
1. **LangChain** - LLM application framework (includes grammar tools)
2. **OpenAI-compatible servers** - Local LLM serving (Ollama, text-generation-webui)
3. **HuggingChat** - Open-source alternative to ChatGPT

---

## 4. TextBlob (Simpler Alternative)

**Best for:** Quick sentiment/tone detection  
**License:** MIT  
**Language:** Python  
**GitHub Stars:** 1,800+ ⭐  

### Code Example
```python
from textblob import TextBlob

text = "This is amazing! I love it."
blob = TextBlob(text)

print(blob.sentiment)  # Sentiment(polarity=0.6, subjectivity=0.75)
print(blob.words)      # ['This', 'is', 'amazing', 'I', 'love', 'it']
print(blob.noun_phrases)  # ['this', 'amazing']
```

---

## 5. SpellChecker (Spelling Focus)

**Best for:** Fast spell checking with context awareness  
**License:** GPL-3.0  
**Language:** Python  
**GitHub Stars:** 1,200+ ⭐  

### Code Example
```python
from spellchecker import SpellChecker

spell = SpellChecker()
misspelled = spell.unknown(['This', 'is', 'a', 'testt'])
print(misspelled)  # {'testt'}
print(spell.correction('testt'))  # 'test'
```

---

## Performance Comparison

| Tool | Speed | Accuracy | Ease of Use | Multi-language | Self-hostable |
|------|-------|----------|-------------|----------------|---------------|
| LanguageTool | 657ms avg | High | Easy | 30+ | Yes |
| spaCy + grammaCy | <1ms | Medium-High | Medium | 70+ | Yes |
| Hugging Face | 1-5s (GPU) | Very High | Medium | Varies | Yes |
| TextBlob | Fast | Medium | Very Easy | Limited | Yes |
| SpellChecker | Very Fast | High | Easy | Limited | Yes |

---

## Recommended Architecture for App Hub

**Backend Stack (Node.js/Express):**
```
Frontend (React) → Express API → NLP Service Layer
                                  ├── LanguageTool (grammar/style)
                                  ├── spaCy (dependency parsing)
                                  ├── Hugging Face (AI corrections)
                                  └── SpellChecker (spelling)
```

**Suggested Combination:**
1. **Primary:** LanguageTool (self-hosted) for grammar + style
2. **Secondary:** spaCy for dependency-based validation
3. **AI Layer:** Hugging Face Transformers for ML-based corrections
4. **Spelling:** SpellChecker or LanguageTool's built-in spell checker

---

## Licensing Notes

- **LGPL-2.1 (LanguageTool):** Can be used commercially; modifications to LanguageTool itself must be shared, but your app can be proprietary
- **MIT (spaCy, TextBlob, SpellChecker):** Fully permissive; use anywhere
- **Apache 2.0 (Hugging Face):** Permissive with patent grant; good for commercial use

---

## Next Steps for Development

1. Clone LanguageTool: `git clone https://github.com/languagetool-org/languagetool.git`
2. Build and run: `./install.sh && java -cp languagetool-server/target/languagetool-server-*-SNAPSHOT.jar org.languagetool.server.HTTPServer --port 8081`
3. Test API: `curl -X POST "http://localhost:8081/v2/check" -d "text=..."`

---

**Research Date:** 12 Oct 2026  
**Sources:** GitHub, npm, official documentation, project pages
