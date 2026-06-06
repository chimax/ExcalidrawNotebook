# 📓 Excalidraw Notebook (Excalidraw with Local Scene Management)

A locally hosted fork of the popular [Excalidraw](https://excalidraw.com/) whiteboard tool, transformed into a personal notebook. 

This project repurposes Excalidraw's infinite canvas into a multi-page, offline notebook. It introduces a custom-built **Local Scene Switcher**, allowing you to manage, save, rename, and delete `.excalidraw` files directly from a dedicated UI panel—just like flipping between pages in a sketchbook.

## ✨ Key Features

* **🗂️ Native Scene Switcher (The "Notebook"):** A completely custom sidebar tab that acts as your local file system. Seamlessly swap between saved drawings with a single click.
* **💾 Intelligent Autosave:** Context-aware saving logic automatically saves your current canvas when switching pages, so you never lose your train of thought.
* **🖱️ Integrated File Management:** Right-click on any scene in your sidebar to rename or delete the local `.excalidraw` file directly from the UI.
* **🧹 Clean, Distraction-Free UI:** All multiplayer collaboration, cloud syncing, premium prompts, and external telemetry features have been stripped out. What remains is a focused, lightweight interface dedicated solely to your local drawings.

## 💡 Why use this?

If you love the intuitive, hand-drawn feel of Excalidraw but want the organized, multi-page structure of a traditional notebook, Excalidraw Notebook is for you. It serves as a lightweight, offline alternative to apps like OneNote or GoodNotes, giving you a snappy, distraction-free environment for your ideas, sketches, and wireframes. 

## 🚀 Getting Started

You can run this project using either `npm` or `yarn`. **If you are new to this, the absolute easiest way to start is Option A.** Just download and install [Node.js](https://nodejs.org/) (you can safely uncheck/skip the Chocolatey installation prompt during setup if it asks), and then run the `npm` commands below.

### Option A: Using NPM

1. Clone this repository:
   `git clone https://github.com/chimax/ExcalidrawNotebook.git`
2. Navigate to the project directory and install dependencies:
   `npm install`
3. Start the local Vite development server:
   `npx vite excalidraw-app`

### Option B: Using Yarn

1. Clone this repository:
   `git clone https://github.com/chimax/ExcalidrawNotebook.git`
2. Navigate to the project directory and install dependencies:
   `yarn install`
3. Start the local Vite development server:
   `yarn start`

*Note: The application will launch on your `localhost`. The `/my-scenes/` directory will be automatically generated in the project root to store your work.*

## 📜 License
This project is built on top of the open-source Excalidraw engine and is distributed under the [MIT License](LICENSE).