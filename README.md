# BCI101 Student Workbook

The student workbook for *BCI101: An Applied Introduction to Noninvasive
Brain-Computer Interfaces*, at four levels: middle school, high school,
college and graduate. Read it at [learn.intomind.com](https://learn.intomind.com).

Record your own brain's electricity, see what an AI model can and can't
tell from it, teach a model two of your own thoughts, and use it to switch
a light.

Add `?level=ms`, `hs`, `college` or `grad` to any page's address to set the
level.

## What the labs use

- An [IntoMind One](https://intomind.com/products/one)
- A computer with Chrome or Edge
- [intomind/demo](https://github.com/intomind/demo): the demos, at [demo.intomind.com](https://demo.intomind.com), and the programs the labs run
- [intomind/api](https://github.com/intomind/api): the `intomind` Python package, `pip install 'intomind[analysis]' mne`
- [intomind/micropython](https://github.com/intomind/micropython): MicroPython for the Raspberry Pi Pico 2 W
- [intomind/eeg-foundation-model-heads](https://github.com/intomind/eeg-foundation-model-heads): the open heads, and their evaluation

## Teachers

The teacher's edition, with lesson plans, answer keys, assessments and a
PDF to print at each level, is free for educators at
[teach.intomind.com](https://teach.intomind.com/join/).

## Run it locally

```
python3 -m http.server 8000      # then open http://localhost:8000/
```

## License

Free for teaching and learning. The workbook's text, figures, problems and
the code shown on its pages are CC BY-NC-SA 4.0, with added permissions for
teachers and students. The code that runs the site, the stylesheet and
scripts in `assets/` and `check.py`, is AGPL-3.0. See
[LICENSING.md](LICENSING.md).
