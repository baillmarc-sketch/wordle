# My Wordle

A custom Wordle clone where **you control the word of the day**. On days you don't set a word, the game automatically picks one from a built-in database of common 5-letter words.

No build step, no dependencies — plain HTML/CSS/JavaScript. Just open `index.html` in a browser, or host the folder anywhere (GitHub Pages works great).

## Setting the word of the day

Edit [`js/daily-words.js`](js/daily-words.js) and add an entry for any date you want to control:

```js
const DAILY_OVERRIDES = {
  "2026-06-14": "party",
  "2026-12-25": "merry",
};
```

- Dates use `YYYY-MM-DD` format (the player's local date).
- Words must be exactly 5 letters. Your word doesn't have to be in the dictionary — it will still be accepted as a guess.
- Any date without an entry gets a deterministic word from the answer database, so everyone playing on the same day sees the same word.

## Custom challenge links

You can also share a one-off puzzle without touching the daily word. Encode any 5-letter word in base64 and pass it as the `w` query parameter:

```js
btoa("crane")  // → "Y3JhbmU="
```

Then share: `https://your-site/index.html?w=Y3JhbmU=`

Challenge games don't affect the daily puzzle or the player's stats.

## Word database

- `js/words.js` contains two lists:
  - `VALID_WORDS` — 15,921 five-letter words accepted as guesses (from the public-domain [dwyl/english-words](https://github.com/dwyl/english-words) list).
  - `ANSWER_WORDS` — 1,122 common five-letter words used for automatic daily puzzles (frequency-filtered via [google-10000-english](https://github.com/first20hours/google-10000-english), with names and proper nouns removed).

To add or remove words, just edit the arrays in that file.

## Features

- Classic 6-guess gameplay with correct duplicate-letter coloring
- On-screen and physical keyboard with letter-state coloring
- Daily progress saved locally — finish or resume on the same device
- Stats: games played, win %, current/max streak, guess distribution
- Shareable emoji-grid results
- Mobile-friendly dark theme

## Running locally

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

Repo → Settings → Pages → deploy from the branch's root folder. The app is fully static, so it works out of the box.
