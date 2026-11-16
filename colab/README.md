# Run the examples in Google Colab

These five Python notebooks use SimPy to explore discrete event simulation. Start with notebook 1 and work through them in order. Each notebook includes its own setup and helper code; you do not need to run another notebook first or install the DES Playground app.

## Open an example

Click **Open in Colab** below. These links open the versions published on this repository’s `main` branch, not any uncommitted local changes.

| Notebook | What you will explore | Launch |
|---|---|---|
| [Single-server queue](01_mm1_single_server.ipynb) | M/M/1 basics, warm-up and confidence intervals | [Open in Colab](https://colab.research.google.com/github/detinger/DES-Playground/blob/main/colab/01_mm1_single_server.ipynb) |
| [Multi-server queue](02_mmc_multi_server.ipynb) | Erlang-C and staffing decisions | [Open in Colab](https://colab.research.google.com/github/detinger/DES-Playground/blob/main/colab/02_mmc_multi_server.ipynb) |
| [Service variability](03_md1_vs_mm1_variability.ipynb) | Compare deterministic and random service times | [Open in Colab](https://colab.research.google.com/github/detinger/DES-Playground/blob/main/colab/03_md1_vs_mm1_variability.ipynb) |
| [Production line](04_production_line.ipynb) | Serial queues, bottlenecks and throughput | [Open in Colab](https://colab.research.google.com/github/detinger/DES-Playground/blob/main/colab/04_production_line.ipynb) |
| [What-if analysis](05_what_if_analysis.ipynb) | Compare scenarios and balance staffing and waiting costs | [Open in Colab](https://colab.research.google.com/github/detinger/DES-Playground/blob/main/colab/05_what_if_analysis.ipynb) |

## Run and save your work

1. Open a notebook and sign in to your Google account if prompted.
2. Choose **File → Save a copy in Drive** to keep your own editable version.
3. Click **Connect** to start a runtime. A standard Python CPU runtime is sufficient; these examples do not need a GPU.
4. Choose **Runtime → Run all**, or run individual cells from top to bottom with the play button beside each code cell. The setup cell installs SimPy.
5. Read the explanations and inspect the tables and plots. Change the model parameters in your copy, then rerun the affected cells and everything below them.

Your Drive copy is separate from this repository. To keep a local copy, use **File → Download → Download .ipynb**.

## Open a local or modified notebook

If a launch link cannot load the repository, or you want to run your local edits:

1. Open [Google Colab](https://colab.research.google.com/).
2. Choose **File → Upload notebook** (or the **Upload** tab in the notebook picker).
3. Select one of the `.ipynb` files from this folder.
4. Save a copy in Drive and run the cells as described above.

## Troubleshooting

- **Notebook not found:** The launch links require the notebooks to be available on GitHub’s `main` branch. Use the upload method for unpublished changes or repositories Colab cannot access.
- **`No module named simpy`:** Run the setup cell containing `!pip install simpy --quiet`, then rerun the imports.
- **`NameError` or missing variables:** Run cells from the beginning in order; later cells depend on earlier definitions.
- **Runtime disconnected or restarted:** Run the setup and calculation cells again. Runtime variables and installed packages do not persist when the runtime is replaced.

For more on opening, saving and running notebooks, see the official [Google Colab FAQ](https://research.google.com/colaboratory/faq.html).

[Back to DES Playground](../README.md)
