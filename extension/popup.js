let draggedExtension = null;

// Initialize the extension
document.addEventListener("DOMContentLoaded", async () => {
  await loadCategories();
  await loadExtensions();
  setupEventListeners();
});

// Load categories from storage and create columns
async function loadCategories() {
  const result = await chrome.storage.sync.get("categories");
  const categories = result.categories || [];
  const categoryList = document.getElementById("categoryList");
  const kanbanBoard = document.getElementById("kanbanBoard");

  // Clear existing content
  categoryList.innerHTML = "";

  // Create a set of all categories (default + custom)
  const defaultColumns = [];
  const allCategories = new Set([...defaultColumns, ...categories]);

  // Add all default columns
  allCategories.forEach((category) => {
    addCategoryColumn(category);
  });

  // Add custom categories to the list
  allCategories.forEach((category) => {
    if (!defaultColumns.includes(category)) {
      const li = document.createElement("li");
      li.className = "category-item";
      li.textContent = category;
      categoryList.appendChild(li);
    }
  });
}

function setupColumnDragAndDrop(column) {
  column.setAttribute("draggable", true);

  column.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", column.dataset.category);
    column.classList.add("dragging");
  });

  column.addEventListener("dragend", () => {
    column.classList.remove("dragging");
  });

  column.addEventListener("dragover", (e) => {
    e.preventDefault(); // Allow drop
  });

  column.addEventListener("drop", (e) => {
    e.preventDefault();
    const draggedCategory = e.dataTransfer.getData("text/plain");
    const draggedColumn = document.querySelector(
      `.kanban-column[data-category="${draggedCategory}"]`
    );

    // Swap columns
    if (draggedColumn && draggedColumn !== column) {
      const parent = column.parentNode;
      const nextSibling =
        column.nextElementSibling === draggedColumn
          ? column
          : column.nextElementSibling;

      parent.insertBefore(draggedColumn, nextSibling);
    }
  });
}

// Function to close a category column
function closeCategory(categoryName) {
  const column = document.querySelector(
    `.kanban-column[data-category="${categoryName}"]`
  );
  if (column) {
    column.remove();
  }

  // Remove from storage
  chrome.storage.sync.get("categories", function (result) {
    let categories = result.categories || [];
    categories = categories.filter((cat) => cat !== categoryName);
    chrome.storage.sync.set({ categories: categories }, function () {
      loadCategories(); // Refresh the category list
    });
  });
}

// Add a category column to the Kanban board
function addCategoryColumn(category) {
  // Check if the column already exists
  const existingColumn = document.querySelector(
    `.kanban-column[data-category="${category}"]`
  );
  if (existingColumn) {
    console.warn(`Column "${category}" already exists.`);
    return; // Exit if the column already exists
  }

  const kanbanBoard = document.getElementById("kanbanBoard");
  const column = document.createElement("div");
  column.className = "kanban-column";
  column.dataset.category = category;

  column.innerHTML = `
    <h2>${category}</h2>
    <button class="close-category">X</button>
    <div class="column-drop-zone" data-status="${category.toLowerCase()}"></div>
  `;

  kanbanBoard.appendChild(column);
  setupDropZone(column.querySelector(".column-drop-zone"));
  setupColumnDragAndDrop(column); // Make the column draggable

  // Add event listener for closing the category
  column
    .querySelector(".close-category")
    .addEventListener("click", () => closeCategory(category));
}

// Load all extensions
async function loadExtensions() {
  try {
    const extensions = await chrome.management.getAll();
    const storedState = await chrome.storage.sync.get("extensionStates");
    const extensionStates = storedState.extensionStates || {};

    // Clear existing cards before loading
    const existingCards = document.querySelectorAll(".kanban-card");
    existingCards.forEach((card) => card.remove());

    extensions.forEach((extension) => {
      if (extension.id === chrome.runtime.id) return; // Skip this extension

      const status =
        extensionStates[extension.id] ||
        (extension.enabled ? "enabled" : "disabled");
      createExtensionCard(extension, status);
    });
  } catch (error) {
    console.error("Error loading extensions:", error.message || error);
    displayError("Failed to load extensions. Please try again.");
  }
}

// Create extension card
function createExtensionCard(extension, status) {
  const card = document.createElement("div");
  card.className = "kanban-card";
  card.draggable = true;
  card.dataset.extensionId = extension.id;

  const extensionInfo = document.createElement("div");
  extensionInfo.className = "extension-info";

  const icon = document.createElement("img");
  icon.className = "extension-icon";
  icon.src =
    extension.icons && extension.icons.length > 0 ? extension.icons[0].url : "";
  icon.alt = "";

  const name = document.createElement("h3");
  name.className = "extension-name";
  name.textContent = extension.name;

  extensionInfo.appendChild(icon);
  extensionInfo.appendChild(name);

  const controls = document.createElement("div");
  controls.className = "extension-controls";

  const button = document.createElement("button");
  button.className = `btn ${extension.enabled ? "btn-disable" : "btn-enable"}`;
  button.textContent = extension.enabled ? "Disable" : "Enable";
  button.onclick = () => toggleExtension(extension.id, !extension.enabled);

  controls.appendChild(button);
  card.appendChild(extensionInfo);
  card.appendChild(controls);

  setupDragAndDrop(card);

  // Find the correct column and append the card
  const column = document.querySelector(
    `.column-drop-zone[data-status="${status.toLowerCase()}"]`
  );
  if (column) {
    column.appendChild(card);
  } else {
    console.warn(
      `Column with status "${status}" not found for extension ${extension.name}`
    );
  }

  return card;
}

// Setup drag and drop
function setupDragAndDrop(element) {
  element.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", element.dataset.extensionId);
    draggedExtension = element;
    element.classList.add("dragging");
  });

  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
    draggedExtension = null;
  });
}

// Setup event listeners
function setupEventListeners() {
  const dropZones = document.querySelectorAll(".column-drop-zone");
  dropZones.forEach(setupDropZone);

  document
    .getElementById("addCategoryButton")
    .addEventListener("click", addNewCategory);
  document
    .getElementById("resetCategories")
    .addEventListener("click", resetCategories);
}

// Setup drop zone for drag and drop functionality
function setupDropZone(dropZone) {
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drop-hover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-hover");
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("drop-hover");

    // Get the dragged element
    const extensionId = e.dataTransfer.getData("text/plain");
    const draggedCard = document.querySelector(
      `[data-extension-id="${extensionId}"]`
    );

    if (!draggedCard) return;

    const newStatus = dropZone.dataset.status;

    try {
      // Update storage
      const storedState = await chrome.storage.sync.get("extensionStates");
      const extensionStates = storedState.extensionStates || {};
      extensionStates[extensionId] = newStatus;
      await chrome.storage.sync.set({ extensionStates });

      // Clone the card and append it to the new zone
      const cardClone = draggedCard.cloneNode(true);
      setupDragAndDrop(cardClone); // Re-setup drag and drop for the clone
      dropZone.appendChild(cardClone);
      draggedCard.remove(); // Remove the original card

      // Update extension state if needed
      if (newStatus === "enabled" || newStatus === "disabled") {
        await toggleExtension(extensionId, newStatus === "enabled");
      }
    } catch (error) {
      console.error("Error updating extension status:", error);
      displayError("Failed to update extension status. Please try again.");
    }
  });
}

// Add new category
async function addNewCategory() {
  const input = document.getElementById("newCategoryInput");
  const categoryName = input.value.trim();

  if (categoryName) {
    const result = await chrome.storage.sync.get("categories");
    const categories = result.categories || [];

    if (!categories.includes(categoryName)) {
      categories.push(categoryName);
      await chrome.storage.sync.set({ categories });

      addCategoryColumn(categoryName);

      // Clear input
      input.value = "";
      loadCategories(); // Refresh category list
    } else {
      displayError("Category already exists.");
    }
  } else {
    displayError("Please enter a category name.");
  }
}

// Toggle extension state
async function toggleExtension(extensionId, enable) {
  try {
    await chrome.management.setEnabled(extensionId, enable);
    const card = document.querySelector(`[data-extension-id="${extensionId}"]`);
    if (card) {
      const button = card.querySelector("button");
      button.textContent = enable ? "Disable" : "Enable";
      button.classList.toggle("btn-enable", !enable);
      button.classList.toggle("btn-disable", enable);

      // Move the card to the appropriate column
      const newStatus = enable ? "enabled" : "disabled";
      const newColumn = document.querySelector(`[data-status="${newStatus}"]`);
      if (newColumn) {
        const cardClone = card.cloneNode(true);
        setupDragAndDrop(cardClone);
        newColumn.appendChild(cardClone);
        card.remove();
      }
    }
  } catch (error) {
    console.error("Error toggling extension:", error);
    displayError("Failed to toggle extension. Please try again.");
  }
}

// Display error message
function displayError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}
