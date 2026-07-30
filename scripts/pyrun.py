#!/usr/bin/env python3
"""Run one page's Python snippets in a single shared session.

Driver for scripts/run-python.mjs. Reads a JSON job on stdin and writes a
JSON result on stdout:

    in:   {"blocks": ["import numpy ...", "print(x)"]}
    out:  {"outputs": ["", "42\n"]}
    out:  {"outputs": [...], "error": {"index": 1, "traceback": "..."}}

Snippets share one set of globals, in document order, so a later block can
build on an earlier one - the same deal Python.exe gives a reader who
presses "Try me" on each block in turn. stdout and stderr are merged, and a
trailing bare expression is echoed as its repr, both of which match what the
browser's Pyodide session shows in its output pane.

The process always exits 0; failures are reported in the JSON so the caller
can print a useful message. Sandboxing is not attempted: snippets on this
blog are trusted, and the same code runs in every reader's browser anyway.
"""

import ast
import contextlib
import io
import json
import linecache
import sys
import traceback


def run_block(index, code, env):
    """Exec one snippet in `env` and return everything it printed."""
    name = f"<snippet {index + 1}>"
    # Let tracebacks quote the offending line even though there's no file.
    linecache.cache[name] = (len(code), None, code.splitlines(True), name)

    tree = ast.parse(code, name)
    tail = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        tail = ast.Expression(tree.body.pop().value)

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        exec(compile(tree, name, "exec"), env)
        if tail is not None:
            value = eval(compile(tail, name, "eval"), env)
            if value is not None:
                print(repr(value))
    return buf.getvalue()


def format_error(exc):
    """Format a traceback showing the snippet's frames, not this driver's."""
    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename == __file__:
        tb = tb.tb_next
    return "".join(traceback.format_exception(type(exc), exc, tb))


def main():
    job = json.load(sys.stdin)
    blocks = job.get("blocks", [])

    env = {"__name__": "__main__", "__doc__": None}
    sys.argv = ["snippet.py"]

    outputs = []
    result = {"outputs": outputs}

    for index, code in enumerate(blocks):
        try:
            outputs.append(run_block(index, code, env))
        except BaseException as exc:  # noqa: BLE001 - report anything, incl. SystemExit
            result["error"] = {
                "index": index,
                "traceback": format_error(exc),
            }
            break

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
