import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "./App";
import { loadFromBlob } from "../data/blob";
import { serializeLibraryAsJSON } from "../data/json";
import { t } from "../i18n";
import type {
  ExcalidrawProps,
  LibraryItem,
  LibraryItems,
  UIAppState,
} from "../types";
import { arrayToMap } from "../utils";
import Stack from "./Stack";
import { MIME_TYPES } from "../constants";
import Spinner from "./Spinner";
import { duplicateElements } from "../element/newElement";
import { LibraryMenuControlButtons } from "./LibraryMenuControlButtons";
import { LibraryDropdownMenu } from "./LibraryMenuHeaderContent";
import {
  LibraryMenuSection,
  LibraryMenuSectionGrid,
} from "./LibraryMenuSection";
import { useScrollPosition } from "../hooks/useScrollPosition";
import { useLibraryCache } from "../hooks/useLibraryItemSvg";

import "./LibraryMenuItems.scss";

// using an odd number of items per batch so the rendering creates an irregular
// pattern which looks more organic
const ITEMS_RENDERED_PER_BATCH = 17;
// when render outputs cached we can render many more items per batch to
// speed it up
const CACHED_ITEMS_RENDERED_PER_BATCH = 64;

// List of scene files display
const SceneListItem = ({ 
  filename, 
  isSaving, 
  onClick, 
  onContextMenu 
}: { 
  filename: string; 
  isSaving: boolean; 
  onClick: () => void; 
  onContextMenu: (e: React.MouseEvent) => void 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu} // <--- Added right-click listener
      disabled={isSaving}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        width: "calc(100% - 16px)",
        boxSizing: "border-box",
        margin: "0 8px",
        padding: "8px 12px",
        textAlign: "left",
        background: isHovered ? "var(--button-hover-bg)" : "transparent",
        border: "none",
        borderRadius: "var(--border-radius-md)",
        cursor: "pointer",
        color: isHovered ? "var(--text-primary-color)" : "var(--icon-fill-color)",
        opacity: isSaving ? 0.5 : 1,
        fontSize: "14px",
        gap: "10px",
        transition: "background-color 0.1s ease"
      }}
    >
      <span style={{ display: "flex", alignItems: "center", opacity: isHovered ? 1 : 0.7, fontSize: "1rem" }}>
        📄
      </span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {filename.replace('.excalidraw', '')}
      </span>
    </button>
  );
};

const SceneListTab = ({ 
  localScenes, 
  isSaving, 
  handleSceneClick,
  refreshScenes,
  app,
  onSaveCurrentScene
}: { 
  localScenes: string[]; 
  isSaving: boolean; 
  handleSceneClick: (name: string) => void;
  refreshScenes: () => void;
  app: any;
  onSaveCurrentScene: () => void;
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, filename: string } | null>(null);

  const getTrueCanvasName = () => {
    const state = app.state as any;
    if (state.fileHandle && state.fileHandle.name) {
      return state.fileHandle.name.replace('.excalidraw', '');
    }
    return state.name || "";
  };

  // Close the context menu if the user clicks anywhere else
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleOutsideClick);
    }
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, filename: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, filename });
  };

  const handleRename = async () => {
    if (!contextMenu) return;
    const oldFile = contextMenu.filename;
    
    const newName = window.prompt("Enter new filename:", oldFile.replace('.excalidraw', ''));
    if (!newName || !newName.trim() || newName.trim() === oldFile.replace('.excalidraw', '')) return;

    const newFile = newName.endsWith(".excalidraw") ? newName.trim() : `${newName.trim()}.excalidraw`;

    try {
      const response = await fetch(`/api/scenes/${oldFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newFile })
      });

      if (response.ok) {
        // --- NEW ARCHITECTURE: Check live app state ---
        if (app.state.name === oldFile.replace('.excalidraw', '')) {
          (app as any).updateScene({
            appState: { 
              ...app.state, 
              name: newName.replace('.excalidraw', '').trim(),
              fileHandle: null // <--- FORCE LOCAL ENVIRONMENT
            },
            commitToHistory: false
          });
        }
        refreshScenes();
      }
    } catch (error) {
      console.error("Error renaming scene:", error);
    }
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    const targetFile = contextMenu.filename;

    if (window.confirm(`Are you sure you want to delete "${targetFile.replace('.excalidraw', '')}"? This cannot be undone.`)) {
      try {
        const response = await fetch(`/api/scenes/${targetFile}`, { method: 'DELETE' });

        if (response.ok) {
          if (app.state.name === targetFile.replace('.excalidraw', '')) {
            (app as any).updateScene({
              appState: { 
                ...app.state, 
                name: "",
                fileHandle: null // <--- FORCE LOCAL ENVIRONMENT
              }, 
              commitToHistory: false
            });
          }
          refreshScenes();
        }
      } catch (error) {
        console.error("Error deleting scene:", error);
      }
    }
  };

  return (
    <div style={{ padding: "0", display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden", flex: 1, boxSizing: "border-box" }}>
      <div 
        className="library-menu-items-container__header" 
        style={{ 
          margin: "12px 12px 6px 12px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <span>Saved Scenes</span>
        {/* BUTTON GROUP */}
        <div style={{ display: "flex", gap: "2px" }}>
          {/* FOLDER BUTTON */}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await fetch("/api/open-folder");
              } catch (err) {
                console.error("Failed to trigger folder open", err);
              }
            }}
            title="Open local folder"
            style={{
              background: "var(--button-hover-bg)",
              border: "none",
              cursor: "pointer",
              color: "var(--icon-fill-color)",
              width: "26px",  
              height: "26px", 
              padding: "0",   
              borderRadius: "var(--border-radius-md)", 
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.8,
              transition: "all 0.1s ease"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--button-hover-bg)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--button-hover-bg)"; e.currentTarget.style.opacity = "0.8"; }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          {/* REFRESH BUTTON */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              refreshScenes();
            }}
            disabled={isSaving}
            title="Refresh scenes"
            style={{
              background: "var(--button-hover-bg)",
              border: "none",
              cursor: isSaving ? "not-allowed" : "pointer",
              color: "var(--icon-fill-color)",
              width: "26px",  
              height: "26px", 
              padding: "0",   
              borderRadius: "var(--border-radius-md)", 
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isSaving ? 0.5 : 0.8,
              transition: "all 0.1s ease"
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.background = "var(--button-hover-bg)";
                e.currentTarget.style.opacity = "1";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.background = "var(--button-hover-bg)";
                e.currentTarget.style.opacity = "0.8";
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>
      {localScenes.length === 0 ? (
        <div style={{ fontSize: "0.875rem", opacity: 0.7, padding: "0 12px" }}>
          No scenes found in /my-scenes/ folder.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {localScenes.map((filename) => (
            <SceneListItem
              key={filename}
              filename={filename}
              isSaving={isSaving}
              onClick={() => handleSceneClick(filename)}
              onContextMenu={(e) => handleContextMenu(e, filename)} // Pass event
            />
          ))}
        </div>
      )}

      {/* --- THE CUSTOM CONTEXT MENU --- */}
      {contextMenu && (
        <div style={{
          position: "fixed",
          top: contextMenu.y,
          left: contextMenu.x,
          background: "var(--island-bg-color, #fff)",
          border: "1px solid var(--sidebar-border-color, #ccc)",
          borderRadius: "var(--border-radius-md, 4px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          padding: "4px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          minWidth: "120px"
        }}>
          <button 
            onClick={handleRename} 
            style={{ padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-primary-color, #000)", borderRadius: "4px" }} 
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--button-hover-bg, #eee)"} 
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            Rename
          </button>
          <button 
            onClick={handleDelete} 
            style={{ padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: "#ff4d4f", borderRadius: "4px" }} 
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--button-hover-bg, #eee)"} 
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            Delete
          </button>
        </div>
      )}

      {/* --- SAVE BUTTON AT THE BOTTOM --- */}
      <div style={{ marginTop: "auto", padding: "12px", borderTop: "1px solid var(--sidebar-border-color)" }}>
        <button
          className="excalidraw-button"
          onClick={onSaveCurrentScene}
          disabled={isSaving}
          style={{
            width: "100%",
            backgroundColor: "var(--color-promo)",
            color: "#ffffff",
            border: "none",
            padding: "0.75rem",
            borderRadius: "var(--border-radius-lg)",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontWeight: "bold",
            opacity: isSaving ? 0.7 : 1
          }}
        >
          {isSaving ? "Saving..." : "💾 Save Current Scene"}
        </button>
      </div>

    </div>
  );
};



export default function LibraryMenuItems({
  isLoading,
  libraryItems,
  onAddToLibrary,
  onInsertLibraryItems,
  pendingElements,
  theme,
  id,
  libraryReturnUrl,
  onSelectItems,
  selectedItems,
}: {
  isLoading: boolean;
  libraryItems: LibraryItems;
  pendingElements: LibraryItem["elements"];
  onInsertLibraryItems: (libraryItems: LibraryItems) => void;
  onAddToLibrary: (elements: LibraryItem["elements"]) => void;
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  selectedItems: LibraryItem["id"][];
  onSelectItems: (id: LibraryItem["id"][]) => void;
}) {

  const app = useApp();
  const [activeTab, setActiveTab] = useState<"library" | "scenes">("library");
  const [localScenes, setLocalScenes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const getTrueCanvasName = () => {
    const state = app.state as any;
    if (state.fileHandle && state.fileHandle.name) {
      return state.fileHandle.name.replace('.excalidraw', '');
    }
    return state.name || "";
  };

  // Fetch the list of scenes from your Vite backend
  const fetchScenes = useCallback(() => {
    fetch("/api/scenes")
      .then((res) => res.json())
      .then((data) => setLocalScenes(data))
      .catch((err) => console.error("Failed to load scenes:", err));
  }, []);

  useEffect(() => {
    if (activeTab === "scenes") {
      fetchScenes();
    }
  }, [activeTab, fetchScenes]);

  // Parent Browser Libraries button hiding
  useEffect(() => {
    const toggleFooter = () => {
      const container = document.querySelector('.library-menu-items-container');
      
      if (container && container.parentElement) {
        let sibling = container.nextElementSibling;
        while (sibling) {
          (sibling as HTMLElement).style.display = activeTab === 'scenes' ? 'none' : '';
          sibling = sibling.nextElementSibling;
        }
      }
    };
    // Run immediately on tab switch
    toggleFooter();
    const timer = setTimeout(toggleFooter, 50);
    // Set up the MutationObserver to guard against canvas selections
    let observer: MutationObserver | null = null;
    const container = document.querySelector('.library-menu-items-container');
    if (container && container.parentElement) {
      observer = new MutationObserver(() => {
        toggleFooter();
      });
      // Watch the parent wrapper for any new elements being added or removed
      observer.observe(container.parentElement, {
        childList: true,
        subtree: false
      });
    }
    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect(); // Clean up when component unmounts
    };
  }, [activeTab]);

  // Save the current canvas, then load the clicked scene natively
  const handleSceneClick = async (filename: string) => {
    console.log(`[Excalidraw Switcher] Clicked on: ${filename}`);
    if (isSaving) return;
    setIsSaving(true);

    try {
      const liveElements = typeof (app as any).getSceneElements === 'function' 
        ? (app as any).getSceneElements() 
        : (app as any).scene?.getElements() || [];
        
      let saveName = getTrueCanvasName();

      // 1. Intelligent scene saving
      if (liveElements.length > 0) {
        
        // Check for both your custom empty string AND native "Untitled"
        if (saveName.trim() === "" || saveName.trim() === "Untitled") {
          let userInput = window.prompt(
            "Before switching scenes, let's save your current canvas. Enter a filename:", 
            "Untitled_Scene"
          );
          if (userInput && userInput.trim() !== "") {
            saveName = userInput.trim();
          } else {
            saveName = ".autosave"; 
          }
        }

        const saveFilename = saveName.endsWith(".excalidraw") ? saveName : `${saveName}.excalidraw`;
        console.log(`[Excalidraw Switcher] Saving current work to: ${saveFilename}`);

        // THE GARBAGE COLLECTOR
        const activeFileIds = new Set<string>(
          liveElements.filter((el: any) => el.type === "image" && el.fileId).map((el: any) => el.fileId as string)
        );
        const allCachedFiles = (app as any).files || {};
        const usedFiles: Record<string, any> = {};
        for (const fileId of activeFileIds) {
          if (allCachedFiles[fileId]) usedFiles[fileId] = allCachedFiles[fileId];
        }

        const validExcalidrawFile = {
          type: "excalidraw",
          version: 2,
          source: "https://excalidraw.com",
          elements: liveElements,
          appState: app.state,
          files: usedFiles
        };
        
        await fetch(`/api/scenes/${saveFilename}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validExcalidrawFile),
        });
        fetchScenes();
      }

      // 2. Fetch new scene
      console.log(`[Excalidraw Switcher] Attempting to load: ${filename}`);
      const response = await fetch(`/api/scenes/${filename}`);
      if (!response.ok) throw new Error("Failed to read scene file");
      
      const blobData = await response.blob();
      const virtualFile = new File([blobData], filename, { type: "application/json" });

      const nativeSceneData = await loadFromBlob(virtualFile, null, null);

      if (nativeSceneData) {
        if (nativeSceneData.files) {
          const fileArray = Object.values(nativeSceneData.files);
          if (fileArray.length > 0) (app as any).addFiles(fileArray);
        }
        
        (app as any).updateScene({
          elements: nativeSceneData.elements || [],
          appState: {
            ...nativeSceneData.appState,
            theme: app.state.theme,
            openSidebar: app.state.openSidebar,
            defaultSidebarDockedPreference: app.state.defaultSidebarDockedPreference,
            name: filename.replace('.excalidraw', ''),
            fileHandle: null,
            isLoading: false
          },
          commitToHistory: false 
        });
        
        if ((app as any).history && typeof (app as any).history.clear === 'function') {
          (app as any).history.clear();
        }
      }

    } catch (error) {
      console.error("Error switching scenes:", error);
    } finally {
      setIsSaving(false);
    }
  };

// --- MANUAL SAVE FUNCTION ---
  const handleExplicitSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const liveElements = typeof (app as any).getSceneElements === 'function' 
        ? (app as any).getSceneElements() 
        : (app as any).scene?.getElements() || [];

      if (liveElements.length === 0) {
        alert("Canvas is empty! Draw something before saving.");
        setIsSaving(false);
        return;
      }

      // --- NEW ARCHITECTURE: Single Source of Truth ---
      let saveName = getTrueCanvasName();

      if (saveName.trim() === "" || saveName.trim() === "Untitled") {
        let userInput = window.prompt("Name your scene:", "Untitled_Scene");
        if (!userInput || !userInput.trim()) {
          setIsSaving(false);
          return; // User canceled
        }
        saveName = userInput.trim();
      }

      const saveFilename = saveName.endsWith(".excalidraw") ? saveName : `${saveName}.excalidraw`;

      // Garbage collector logic
      const activeFileIds = new Set<string>(
        liveElements.filter((el: any) => el.type === "image" && el.fileId).map((el: any) => el.fileId as string)
      );
      const allCachedFiles = (app as any).files || {};
      const usedFiles: Record<string, any> = {};
      for (const fileId of activeFileIds) {
        if (allCachedFiles[fileId]) usedFiles[fileId] = allCachedFiles[fileId];
      }

      const validExcalidrawFile = {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements: liveElements,
        appState: app.state,
        files: usedFiles
      };
      
      await fetch(`/api/scenes/${saveFilename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validExcalidrawFile),
      });

      // Crucial: Update the canvas title to match the newly saved file name in case they just typed it
      (app as any).updateScene({
        appState: { 
          ...app.state, 
          name: saveName.replace(".excalidraw", ""),
          fileHandle: null
        },
        commitToHistory: false
      });

      fetchScenes();
    } catch (error) {
      console.error("Failed to save scene locally:", error);
    } finally {
      setIsSaving(false);
    }
  };


  const libraryContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useScrollPosition<HTMLDivElement>(libraryContainerRef);

  // This effect has to be called only on first render, therefore  `scrollPosition` isn't in the dependency array
  useEffect(() => {
    if (scrollPosition > 0) {
      libraryContainerRef.current?.scrollTo(0, scrollPosition);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { svgCache } = useLibraryCache();
  const unpublishedItems = useMemo(
    () => libraryItems.filter((item) => item.status !== "published"),
    [libraryItems],
  );

  const publishedItems = useMemo(
    () => libraryItems.filter((item) => item.status === "published"),
    [libraryItems],
  );

  const showBtn = !libraryItems.length && !pendingElements.length;

  const isLibraryEmpty =
    !pendingElements.length &&
    !unpublishedItems.length &&
    !publishedItems.length;

  const [lastSelectedItem, setLastSelectedItem] = useState<
    LibraryItem["id"] | null
  >(null);

  const onItemSelectToggle = useCallback(
    (id: LibraryItem["id"], event: React.MouseEvent) => {
      const shouldSelect = !selectedItems.includes(id);

      const orderedItems = [...unpublishedItems, ...publishedItems];

      if (shouldSelect) {
        if (event.shiftKey && lastSelectedItem) {
          const rangeStart = orderedItems.findIndex(
            (item) => item.id === lastSelectedItem,
          );
          const rangeEnd = orderedItems.findIndex((item) => item.id === id);

          if (rangeStart === -1 || rangeEnd === -1) {
            onSelectItems([...selectedItems, id]);
            return;
          }

          const selectedItemsMap = arrayToMap(selectedItems);
          const nextSelectedIds = orderedItems.reduce(
            (acc: LibraryItem["id"][], item, idx) => {
              if (
                (idx >= rangeStart && idx <= rangeEnd) ||
                selectedItemsMap.has(item.id)
              ) {
                acc.push(item.id);
              }
              return acc;
            },
            [],
          );

          onSelectItems(nextSelectedIds);
        } else {
          onSelectItems([...selectedItems, id]);
        }
        setLastSelectedItem(id);
      } else {
        setLastSelectedItem(null);
        onSelectItems(selectedItems.filter((_id) => _id !== id));
      }
    },
    [
      lastSelectedItem,
      onSelectItems,
      publishedItems,
      selectedItems,
      unpublishedItems,
    ],
  );

  const getInsertedElements = useCallback(
    (id: string) => {
      let targetElements;
      if (selectedItems.includes(id)) {
        targetElements = libraryItems.filter((item) =>
          selectedItems.includes(item.id),
        );
      } else {
        targetElements = libraryItems.filter((item) => item.id === id);
      }
      return targetElements.map((item) => {
        return {
          ...item,
          // duplicate each library item before inserting on canvas to confine
          // ids and bindings to each library item. See #6465
          elements: duplicateElements(item.elements, { randomizeSeed: true }),
        };
      });
    },
    [libraryItems, selectedItems],
  );

  const onItemDrag = useCallback(
    (id: LibraryItem["id"], event: React.DragEvent) => {
      event.dataTransfer.setData(
        MIME_TYPES.excalidrawlib,
        serializeLibraryAsJSON(getInsertedElements(id)),
      );
    },
    [getInsertedElements],
  );

  const isItemSelected = useCallback(
    (id: LibraryItem["id"] | null) => {
      if (!id) {
        return false;
      }

      return selectedItems.includes(id);
    },
    [selectedItems],
  );

  const onAddToLibraryClick = useCallback(() => {
    onAddToLibrary(pendingElements);
  }, [pendingElements, onAddToLibrary]);

  const onItemClick = useCallback(
    (id: LibraryItem["id"] | null) => {
      if (id) {
        onInsertLibraryItems(getInsertedElements(id));
      }
    },
    [getInsertedElements, onInsertLibraryItems],
  );

  const itemsRenderedPerBatch =
    svgCache.size >= libraryItems.length
      ? CACHED_ITEMS_RENDERED_PER_BATCH
      : ITEMS_RENDERED_PER_BATCH;

  return (
    <div
      className="library-menu-items-container"
      style={{ justifyContent: "flex-start", borderBottom: 0 }}
    >
      {/* NEW TAB BUTTONS */}
      <div style={{ display: "flex", gap: "10px", padding: "10px", borderBottom: "1px solid var(--sidebar-border-color)", marginBottom: "10px", flexShrink: 0 }}>
        <button 
          onClick={() => setActiveTab("library")}
          style={{ flex: 1, padding: "8px", fontWeight: activeTab === "library" ? "bold" : "normal", background: activeTab === "library" ? "var(--color-primary-light)" : "transparent", border: "none", borderRadius: "5px", cursor: "pointer", color: "var(--text-primary-color)" }}
        >
          Library
        </button>
        <button 
          onClick={() => setActiveTab("scenes")}
          style={{ flex: 1, padding: "8px", fontWeight: activeTab === "scenes" ? "bold" : "normal", background: activeTab === "scenes" ? "var(--color-primary-light)" : "transparent", border: "none", borderRadius: "5px", cursor: "pointer", color: "var(--text-primary-color)" }}
        >
          My Scenes
        </button>
      </div>

      {/* RENDER CUSTOM SCENES TAB */}
      {activeTab === "scenes" && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, boxSizing: "border-box" }}>
          <SceneListTab 
            localScenes={localScenes} 
            isSaving={isSaving} 
            handleSceneClick={handleSceneClick} 
            refreshScenes={fetchScenes} 
            app={app}
            onSaveCurrentScene={handleExplicitSave}
          />
        </div>
      )}

      {/* RENDER ORIGINAL LIBRARY TAB */}
      {activeTab === "library" && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, boxSizing: "border-box" }}>
          {!isLibraryEmpty && (
            <LibraryDropdownMenu
              selectedItems={selectedItems}
              onSelectItems={onSelectItems}
              className="library-menu-dropdown-container--in-heading"
            />
          )}
          <Stack.Col
            className="library-menu-items-container__items"
            align="start"
            gap={1}
            style={{
              flex: 1,
              justifyContent: (!pendingElements.length && !unpublishedItems.length && !publishedItems.length) ? "center" : "flex-start",
              marginBottom: 0,
            }}
            ref={libraryContainerRef}
          >
            <>
              {!isLibraryEmpty && (
                <div className="library-menu-items-container__header">
                  {t("labels.personalLib")}
                </div>
              )}
              {isLoading && (
                <div
                  style={{
                    position: "absolute",
                    top: "var(--container-padding-y)",
                    right: "var(--container-padding-x)",
                    transform: "translateY(50%)",
                  }}
                >
                  <Spinner />
                </div>
              )}
              {!pendingElements.length && !unpublishedItems.length ? (
                <div className="library-menu-items__no-items">
                  <div className="library-menu-items__no-items__label">
                    {t("library.noItems")}
                  </div>
                  <div className="library-menu-items__no-items__hint">
                    {publishedItems.length > 0
                      ? t("library.hint_emptyPrivateLibrary")
                      : t("library.hint_emptyLibrary")}
                  </div>
                </div>
              ) : (
                <LibraryMenuSectionGrid>
                  {pendingElements.length > 0 && (
                    <LibraryMenuSection
                      itemsRenderedPerBatch={itemsRenderedPerBatch}
                      items={[{ id: null, elements: pendingElements }]}
                      onItemSelectToggle={onItemSelectToggle}
                      onItemDrag={onItemDrag}
                      onClick={onAddToLibraryClick}
                      isItemSelected={isItemSelected}
                      svgCache={svgCache}
                    />
                  )}
                  <LibraryMenuSection
                    itemsRenderedPerBatch={itemsRenderedPerBatch}
                    items={unpublishedItems}
                    onItemSelectToggle={onItemSelectToggle}
                    onItemDrag={onItemDrag}
                    onClick={onItemClick}
                    isItemSelected={isItemSelected}
                    svgCache={svgCache}
                  />
                </LibraryMenuSectionGrid>
              )}
            </>

            <>
              {(publishedItems.length > 0 ||
                pendingElements.length > 0 ||
                unpublishedItems.length > 0) && (
                <div className="library-menu-items-container__header library-menu-items-container__header--excal">
                  {t("labels.excalidrawLib")}
                </div>
              )}
              {publishedItems.length > 0 ? (
                <LibraryMenuSectionGrid>
                  <LibraryMenuSection
                    itemsRenderedPerBatch={itemsRenderedPerBatch}
                    items={publishedItems}
                    onItemSelectToggle={onItemSelectToggle}
                    onItemDrag={onItemDrag}
                    onClick={onItemClick}
                    isItemSelected={isItemSelected}
                    svgCache={svgCache}
                  />
                </LibraryMenuSectionGrid>
              ) : unpublishedItems.length > 0 ? (
                <div
                  style={{
                    margin: "1rem 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    fontSize: ".9rem",
                  }}
                >
                  {t("library.noItems")}
                </div>
              ) : null}
            </>

            {showBtn && (
              <LibraryMenuControlButtons
                style={{ padding: "16px 0", width: "100%" }}
                id={id}
                libraryReturnUrl={libraryReturnUrl}
                theme={theme}
              >
                <LibraryDropdownMenu
                  selectedItems={selectedItems}
                  onSelectItems={onSelectItems}
                />
              </LibraryMenuControlButtons>
            )}
          </Stack.Col>
        </div>
      )}
    </div>
  );
}
