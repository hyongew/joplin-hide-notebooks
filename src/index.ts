import joplin from 'api';
import { MenuItemLocation } from 'api/types';

const trashFolderId = "de1e7ede1e7ede1e7ede1e7ede1e7ede";

joplin.plugins.register({
	onStart: async function () {
		// Settings
		await joplin.settings.registerSection('hideNotebooksSection', {
			label: 'Hide Notebooks',
			iconName: 'fas fa-eye-slash',
		});

		await joplin.settings.registerSettings({
			'hiddenNotebookIds': {
				value: [],
				type: 4, // Array
				public: false,
				section: 'hideNotebooksSection',
				label: 'Hidden Notebook IDs',
			},
			'showAllNotes': {
				value: true,
				type: 3, // Boolean
				public: true,
				section: 'hideNotebooksSection',
				label: 'Show "All notes" in sidebar',
			},
			'showTrash': {
				value: true,
				type: 3, // Boolean
				public: true,
				section: 'hideNotebooksSection',
				label: 'Show "Trash" in sidebar',
			},
		});

		// Intercept note selection to prevent access to hidden notebooks
		await joplin.workspace.onNoteSelectionChange(async () => {
			const hiddenIdsArr = await joplin.settings.value('hiddenNotebookIds');
			let hiddenIds: string[] = [];
			try { hiddenIds = hiddenIdsArr || []; } catch (e) { hiddenIds = []; }
			if (!hiddenIds.length) return;

			const currentFolder = await joplin.workspace.selectedFolder();

			try {
				if (currentFolder && (hiddenIds.includes(currentFolder.id) ||
					  hiddenIds.includes(currentFolder.parent_id) ||
					  currentFolder.id == trashFolderId ||
					  currentFolder.parent_id == trashFolderId)) {
					openUnhiddenNote(hiddenIds);
				}
			} catch (e) {
				console.error(e)
			}
		});

		// Also intercept folder selection to prevent selecting hidden folders
		await joplin.settings.onChange(async (event: any) => {
			if (event.keys.includes('hiddenNotebookIds')) {
				// Check if current folder is now hidden
				const hiddenIdsArr = await joplin.settings.value('hiddenNotebookIds');
				let hiddenIds: string[] = [];
				try { hiddenIds = hiddenIdsArr || []; } catch (e) { hiddenIds = []; }
				if (!hiddenIds.length) return;

				try {
					const currentFolder = await joplin.workspace.selectedFolder();
					if (currentFolder && (hiddenIds.includes(currentFolder.id) ||
							hiddenIds.includes(currentFolder.parent_id) ||
					  	currentFolder.id == trashFolderId ||
					  	currentFolder.parent_id == trashFolderId)) {
						openUnhiddenNote(hiddenIds);
					}
				} catch (e) {
					console.error(e);
				}
			}
		});

		// CSS Generation
		const updateCss = async () => {
			const hideNotebooksSettings = await joplin.settings.values(['hiddenNotebookIds', 'showAllNotes', 'showTrash']);
			let hiddenIds: string[] = [];
			try {
				hiddenIds = hideNotebooksSettings.hiddenNotebookIds as string[];
			} catch (e) {
				hiddenIds = [];
			}

			const showAllNotes = hideNotebooksSettings.showAllNotes;
			const showTrash = hideNotebooksSettings.showTrash;

			let css = '';

			// Hide Notebooks
			for (const id of hiddenIds) {
				css += `
					.list-item-wrapper[data-id="${id}"] {
						display: none !important;
					}
				`;
			}

			// Hide All Notes
			if (!showAllNotes) {
				css += `
					.all-notes {
						display: none !important;
					}
				`;
			}

			if (!showTrash) {
				css += `
					.list-item-wrapper[data-id="${trashFolderId}"] ~ * {
						display: none !important
					}
				`;
			}

			const fs = joplin.require('fs-extra');
			const dataDir = await joplin.plugins.dataDir();
			const cssFilePath = `${dataDir}/generated.css`;
			await fs.writeFile(cssFilePath, css);
			await joplin.window.loadChromeCssFile(cssFilePath);
		};

		const openUnhiddenNote = async (hiddenIds: string[]) => {
			let safeNoteId = null;
					
			const notes = await joplin.data.get(['notes'], {
				fields: ['id', 'parent_id'],
				order_by: 'title',
				order_dir: 'ASC'
			});

			for (const n of notes.items) {
				if (!hiddenIds.includes(n.parent_id)) {
					safeNoteId = n.id;
					break;
				}
			}
			
			if (safeNoteId) {
				await joplin.commands.execute('openNote', safeNoteId);
			}
		}

		// Initial CSS load
		await updateCss();

		// Register commands
		await joplin.commands.register({
			name: 'hideNotebook',
			label: 'Hide notebook',
			execute: async (folderId: string) => {
				if (!folderId) return;

				const hiddenIdsArr = await joplin.settings.value('hiddenNotebookIds');
				let hiddenIds: string[] = [];
				try { hiddenIds = hiddenIdsArr || []; } catch (e) { hiddenIds = []; }

				const folders = await joplin.data.get(['folders'], { fields: ['id', 'parent_id'] });
				let unhiddenFolderCount = folders?.items?.length ?? 0;

				try {
					folders.items.forEach(folder => {
						if (hiddenIds.includes(folder.id) ||
								hiddenIds.includes(folder.parent_id) ||
								folder.id==folderId ||
								folder.parent_id==folderId) {
							unhiddenFolderCount--;
						}
					});
				} catch (e) {
					console.error(e);
				}

				if (!unhiddenFolderCount) {
					await joplin.views.dialogs.showMessageBox("Last notebook can't be hidden!");
				} else if (!hiddenIds.includes(folderId)) {
					hiddenIds.push(folderId);
					
					// Also hide sub noteboooks
					try {
						folders.items.forEach(folder => {
							if (hiddenIds.includes(folder.parent_id)) {
								hiddenIds.push(folder.id)
							}
						});
					} catch (e) {
						console.error(e);
					}

					await joplin.settings.setValue('hiddenNotebookIds', hiddenIds);
					await updateCss();
				}
			},
		});

		await joplin.commands.register({
			name: 'showHiddenNotebooks',
			label: 'Show hidden notebooks',
			execute: async () => {
				const result = await joplin.views.dialogs.showMessageBox('Are you sure you want to unhide all hidden notebooks?');
				const showTrash = await joplin.settings.value('showTrash');
				if (result === 0) {
					await joplin.settings.setValue('hiddenNotebookIds', showTrash ? [] : [trashFolderId]);
					await updateCss();
				}
			}
		});

		await joplin.commands.register({
			name: 'toggleAllNotes',
			label: 'Toggle "All notes"',
			execute: async () => {
				const current = await joplin.settings.value('showAllNotes');
				await joplin.settings.setValue('showAllNotes', !current);
				await updateCss();
			}
		});

		await joplin.commands.register({
			name: 'toggleTrash',
			label: 'Toggle "Trash"',
			execute: async () => {
				const current = await joplin.settings.value('showTrash');
				const hiddenIdsArr = await joplin.settings.value('hiddenNotebookIds');
				let hiddenIds: string[] = [];
				try { hiddenIds = hiddenIdsArr || []; } catch (e) { hiddenIds = []; }

				if (current) {
					hiddenIds.push(trashFolderId);
				} else {
					hiddenIds = hiddenIds.filter(folderId => folderId!=trashFolderId);
				}

				await joplin.settings.setValue('showTrash', !current);
				await joplin.settings.setValue('hiddenNotebookIds', hiddenIds);
				await updateCss();
			}
		});

		// Register Menu Items
		await joplin.views.menuItems.create('hideNotebookItem', 'hideNotebook', MenuItemLocation.FolderContextMenu);
		await joplin.views.menuItems.create('toggleAllNotesItem', 'toggleAllNotes', MenuItemLocation.View);
		await joplin.views.menuItems.create('toggleTrashItem', 'toggleTrash', MenuItemLocation.View);
		await joplin.views.menuItems.create('showHiddenNotebooksItem', 'showHiddenNotebooks', MenuItemLocation.View);

		// Listen for setting changes
		await joplin.settings.onChange(async (event: any) => {
			if (event.keys.includes('hiddenNotebookIds') || event.keys.includes('showAllNotes') || event.keys.includes('showTrash')) {
				await updateCss();
			}
		});
	},
});
