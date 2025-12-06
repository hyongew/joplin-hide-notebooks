import joplin from 'api';
import { MenuItemLocation } from 'api/types';

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
					.list-item-wrapper[data-id="de1e7ede1e7ede1e7ede1e7ede1e7ede"] {
						display: none !important;
					}
				`;
			}

			const fs = joplin.require('fs-extra');
			const dataDir = await joplin.plugins.dataDir();
			const cssFilePath = `${dataDir}/generated.css`;
			await fs.writeFile(cssFilePath, css);
			await joplin.window.loadChromeCssFile(cssFilePath);
		};

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

				if (!hiddenIds.includes(folderId)) {
					hiddenIds.push(folderId);
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
				if (result === 0) {
					await joplin.settings.setValue('hiddenNotebookIds', []);
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
				await joplin.settings.setValue('showTrash', !current);
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
