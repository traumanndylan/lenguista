document.addEventListener('DOMContentLoaded', () => {
    const API_URL = `/api`;

    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    const role = localStorage.getItem('role') || 'Student';
    const username = localStorage.getItem('username') || 'User';

    // UI Updates
    document.getElementById('user-name').innerText = username;
    document.getElementById('user-avatar').innerText = username.charAt(0).toUpperCase();

    // DOM Elements
    const btnActionClass = document.getElementById('btn-action-class');
    const actionClassText = document.getElementById('action-class-text');

    const emptyState = document.getElementById('empty-state');
    const classesGridView = document.getElementById('classes-grid-view');
    const classInterface = document.getElementById('class-interface');
    const postDetailedView = document.getElementById('post-detailed-view');

    const modalCreate = document.getElementById('modal-create-class');
    const modalJoin = document.getElementById('modal-join-class');
    const modalAnnounce = document.getElementById('modal-create-announcement');
    const modalAssign = document.getElementById('modal-create-assignment');
    const modalJoinMeeting = document.getElementById('modal-join-meeting');
    const modalCreateMeeting = document.getElementById('modal-create-meeting');
    const modalMeetingCreated = document.getElementById('modal-meeting-created');

    // Config based on role
    if (role === 'Student') {
        actionClassText.innerText = 'Join a Class';
        btnActionClass.addEventListener('click', () => modalJoin.classList.remove('hidden'));
    } else {
        actionClassText.innerText = 'Create a Class';
        btnActionClass.addEventListener('click', () => modalCreate.classList.remove('hidden'));
        const tutorControls = document.getElementById('tutor-controls');
        if (tutorControls) tutorControls.classList.remove('hidden');
    }

    // Join Meeting button (visible to all roles)
    document.getElementById('btn-join-meeting').addEventListener('click', () => {
        modalJoinMeeting.classList.remove('hidden');
    });

    const closeModals = () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        // Clear validation errors when closing modals
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    };

    document.querySelectorAll('.btn-secondary').forEach(btn => {
        if (btn.innerText.includes('Cancel')) {
            btn.addEventListener('click', closeModals);
        }
    });

    document.getElementById('btn-create-announcement')?.addEventListener('click', () => modalAnnounce.classList.remove('hidden'));
    document.getElementById('btn-create-assignment')?.addEventListener('click', () => modalAssign.classList.remove('hidden'));
    document.getElementById('btn-program-meeting')?.addEventListener('click', () => modalCreateMeeting.classList.remove('hidden'));

    document.getElementById('btn-back-to-class').addEventListener('click', () => {
        postDetailedView.classList.add('hidden');
        classInterface.classList.remove('hidden');
    });

    document.getElementById('btn-back-to-grid').addEventListener('click', () => {
        currentClass = null;
        document.getElementById('main-view').style.removeProperty('--primary-color');
        window.history.pushState({}, '', '/classroom/');
        renderMainView();
    });

    // --- FORM VALIDATION ---
    function validateForm(form) {
        let isValid = true;
        // Clear previous errors
        form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));

        form.querySelectorAll('[required]').forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('input-error');
                const group = input.closest('.input-group');
                if (group) group.classList.add('has-error');
            }
        });

        // Clear error on input
        form.querySelectorAll('[required]').forEach(input => {
            input.addEventListener('input', function handler() {
                if (input.value.trim()) {
                    input.classList.remove('input-error');
                    const group = input.closest('.input-group');
                    if (group) group.classList.remove('has-error');
                }
            }, { once: true });
        });

        return isValid;
    }

    // --- CUSTOM FILE INPUT ---
    const fileInput = document.getElementById('assign-files');
    const fileNameDisplay = document.getElementById('assign-files-name');
    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                const names = Array.from(fileInput.files).map(f => f.name);
                fileNameDisplay.textContent = names.join(', ');
            } else {
                fileNameDisplay.textContent = 'No files selected';
            }
        });
    }

    // API Helpers
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = { 'Authorization': `Bearer ${token}` };
        if (!(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = body ? JSON.stringify(body) : null;
        }

        const res = await fetch(`${API_URL}${endpoint}`, { method, headers, body });
        if (!res.ok) {
            // If token expired or invalid, redirect to login
            if (res.status === 401 || res.status === 400) {
                const err = await res.json();
                if (err.error && (err.error.includes('token') || err.error.includes('Token'))) {
                    localStorage.clear();
                    window.location.href = '/';
                    return;
                }
                throw new Error(err.error || 'API Error');
            }
            const err = await res.json();
            throw new Error(err.error || 'API Error');
        }
        return res.json();
    }

    // Modal Helpers
    function showError(title, message) {
        document.getElementById('error-title').innerText = title;
        document.getElementById('error-message').innerText = message;
        document.getElementById('modal-error').classList.remove('hidden');
    }

    let confirmCallback = null;
    function showConfirm(title, message, onConfirm) {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        document.getElementById('modal-confirm').classList.remove('hidden');
        confirmCallback = onConfirm;
    }

    document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
        document.getElementById('modal-confirm').classList.add('hidden');
        confirmCallback = null;
    });

    document.getElementById('btn-confirm-action').addEventListener('click', () => {
        document.getElementById('modal-confirm').classList.add('hidden');
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
    });

    // State
    let classes = [];
    let currentClass = null;
    let posts = [];
    let currentPost = null;

    async function loadClasses() {
        try {
            classes = await apiRequest('/classes');
            renderMainView();
        } catch (err) {
            console.error('Failed to load classes', err);
            renderMainView();
        }
    }

    async function loadPosts(classId) {
        try {
            posts = await apiRequest(`/classes/${classId}/posts`);
            renderFeed();
        } catch (err) {
            console.error('Failed to load posts', err);
        }
    }

    async function deletePost(postId) {
        showConfirm('Delete Post', 'Are you sure you want to delete this post? This cannot be undone.', async () => {
            try {
                await apiRequest(`/classes/${currentClass._id}/posts/${postId}`, 'DELETE');
                posts = posts.filter(p => p._id !== postId);
                renderFeed();
            } catch (err) {
                showError('Delete Failed', err.message);
            }
        });
    }

    // Navigation
    document.getElementById('nav-classes').addEventListener('click', (e) => {
        e.preventDefault();
        currentClass = null;
        document.getElementById('main-view').style.removeProperty('--primary-color');
        window.history.pushState({}, '', '/classroom/');
        renderMainView();
    });

    function renderMainView() {
        classInterface.classList.add('hidden');
        postDetailedView.classList.add('hidden');

        if (classes.length === 0) {
            emptyState.classList.remove('hidden');
            classesGridView.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            classesGridView.classList.remove('hidden');
            renderClassesGrid();
        }
    }

    function renderClassesGrid() {
        const grid = document.getElementById('classes-grid');
        grid.innerHTML = '';
        classes.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'class-card';
            card.style.border = 'none';
            card.style.position = 'relative';

            let deleteBtnHTML = '';
            if (role === 'Tutor') {
                deleteBtnHTML = `<div class="btn-delete-class" data-id="${cls._id}" style="position:absolute; top: 20px; right: 20px; color: var(--text-secondary); cursor: pointer; z-index: 10;"><i class="ph ph-trash"></i></div>`;
            }

            card.innerHTML = `
                ${deleteBtnHTML}
                <div class="class-header" style="border-top: 6px solid ${cls.color}; padding-right: 40px;">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; pointer-events: none;">${cls.name}</h3>
                </div>
                <div class="class-body" style="pointer-events: none;">
                    <p style="font-size: 0.95rem;">${cls.description || 'No description'}</p>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-class')) return;
                openClass(cls);
            });
            grid.appendChild(card);
        });

        // Delete class bindings
        document.querySelectorAll('.btn-delete-class').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                showConfirm('Delete Class', 'Are you sure you want to delete this class? All posts and materials will be permanently removed.', async () => {
                    try {
                        await apiRequest(`/classes/${id}`, 'DELETE');
                        classes = classes.filter(c => c._id !== id);
                        renderMainView();
                    } catch (err) {
                        showError('Delete Failed', err.message);
                    }
                });
            });
        });
    }

    function openClass(cls, updateUrl = true) {
        currentClass = cls;
        emptyState.classList.add('hidden');
        classesGridView.classList.add('hidden');
        postDetailedView.classList.add('hidden');
        classInterface.classList.remove('hidden');

        document.getElementById('class-title').innerText = currentClass.name;
        document.getElementById('class-description').innerText = currentClass.description;
        document.getElementById('class-code-display').innerText = currentClass.code;
        document.getElementById('class-banner').style.backgroundColor = currentClass.color;

        document.getElementById('main-view').style.setProperty('--primary-color', currentClass.color);

        if (updateUrl) {
            window.history.pushState({ classCode: cls.code }, '', `/classroom/${cls.code}`);
        }

        loadPosts(currentClass._id);
    }

    // --- FORMS ---
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            document.getElementById('create-class-color').value = opt.getAttribute('data-color');
        });
    });

    document.getElementById('form-create-class').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        try {
            const newClass = await apiRequest('/classes', 'POST', {
                name: document.getElementById('create-class-name').value,
                description: document.getElementById('create-class-desc').value,
                color: document.getElementById('create-class-color').value
            });
            classes.push(newClass);
            closeModals();
            document.getElementById('form-create-class').reset();
            renderMainView();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('form-join-class').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        const code = document.getElementById('join-class-code').value.trim();
        try {
            const joinedClass = await apiRequest('/classes/join', 'POST', { code });
            classes.push(joinedClass);
            closeModals();
            document.getElementById('form-join-class').reset();
            renderMainView();
        } catch (err) {
            showError('Join Failed', err.message);
        }
    });

    // --- JOIN MEETING ---
    document.getElementById('form-join-meeting').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        const codeInput = document.getElementById('join-meeting-code');
        const code = codeInput.value.trim().toUpperCase();
        
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner"></i> Joining...';

        try {
            await apiRequest(`/classes/meetings/validate/${code}`);
            window.location.href = `/meet/${code}`;
        } catch (err) {
            showError('Invalid Meeting', err.message);
            codeInput.classList.add('input-error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    // --- PROGRAM A MEETING ---
    document.getElementById('form-create-meeting').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        const originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="ph ph-spinner"></i> Scheduling...';

        try {
            const date = document.getElementById('meeting-date').value;
            const time = document.getElementById('meeting-time').value;
            const scheduledAt = new Date(`${date}T${time}`);

            const meeting = await apiRequest(`/classes/${currentClass._id}/meetings`, 'POST', {
                name: document.getElementById('meeting-name').value,
                description: document.getElementById('meeting-desc').value,
                scheduledAt: scheduledAt.toISOString()
            });

            closeModals();
            document.getElementById('form-create-meeting').reset();

            // Show success modal with the code
            document.getElementById('meeting-code-result').innerText = meeting.code;
            document.getElementById('meeting-datetime-result').innerText =
                new Date(meeting.scheduledAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });
            modalMeetingCreated.classList.remove('hidden');

            // Reload posts so the meeting appears in feed
            loadPosts(currentClass._id);
        } catch (err) {
            alert(err.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
        }
    });

    // --- POST CREATION ---
    document.getElementById('form-create-announcement').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        try {
            const newPost = await apiRequest(`/classes/${currentClass._id}/posts`, 'POST', {
                type: 'announcement',
                author: username,
                title: document.getElementById('announce-title').value,
                text: document.getElementById('announce-desc').value,
                attachments: []
            });
            posts.unshift(newPost);
            closeModals();
            document.getElementById('form-create-announcement').reset();
            renderFeed();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById('form-create-assignment').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm(e.target)) return;
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Uploading...';

        try {
            const assignFileInput = document.getElementById('assign-files');
            let uploadedAttachments = [];

            // Upload files one by one to Drive API
            if (assignFileInput.files.length > 0) {
                for (let i = 0; i < assignFileInput.files.length; i++) {
                    const file = assignFileInput.files[i];
                    const formData = new FormData();
                    formData.append('file', file);

                    const res = await apiRequest('/upload', 'POST', formData);
                    uploadedAttachments.push({
                        type: 'file',
                        name: file.name,
                        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                        url: `https://drive.google.com/file/d/${res.driveId}/view`
                    });
                }
            }

            const newPost = await apiRequest(`/classes/${currentClass._id}/posts`, 'POST', {
                type: 'assignment',
                author: username,
                title: document.getElementById('assign-title').value,
                text: document.getElementById('assign-desc').value,
                score: document.getElementById('assign-score').value,
                due: document.getElementById('assign-due').value,
                attachments: uploadedAttachments
            });

            posts.unshift(newPost);
            closeModals();
            document.getElementById('form-create-assignment').reset();
            if (fileNameDisplay) fileNameDisplay.textContent = 'No files selected';
            renderFeed();
        } catch (err) {
            alert(err.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerText = 'Assign';
        }
    });

    // Feed
    function renderFeed() {
        const feedStream = document.getElementById('feed-stream');
        const emptyFeed = document.getElementById('empty-feed');
        feedStream.innerHTML = '';

        if (posts.length === 0) {
            emptyFeed.classList.remove('hidden');
        } else {
            emptyFeed.classList.add('hidden');
            posts.forEach(post => {
                const postEl = document.createElement('div');
                postEl.className = 'card';
                postEl.style.marginTop = '0';
                postEl.style.marginBottom = '20px';
                postEl.style.padding = '20px';
                postEl.style.cursor = 'pointer';
                postEl.style.transition = 'background-color 0.2s';

                postEl.addEventListener('mouseenter', () => postEl.style.backgroundColor = 'var(--bg-card-hover)');
                postEl.addEventListener('mouseleave', () => postEl.style.backgroundColor = 'var(--bg-card)');

                let icon;
                if (post.type === 'assignment') icon = 'clipboard-text';
                else if (post.type === 'meeting') icon = 'video-camera';
                else icon = 'megaphone';

                const dateObj = new Date(post.createdAt);
                const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Extra info line for meetings
                let extraInfo = '';
                if (post.type === 'meeting' && post.meetingDate) {
                    const meetDate = new Date(post.meetingDate);
                    extraInfo = `<div style="font-size: 0.8rem; color: var(--primary-color); margin-top: 4px;"><i class="ph ph-calendar" style="margin-right: 4px;"></i>${meetDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>`;
                }

                postEl.innerHTML = `
                    <div style="display: flex; gap: 15px; align-items: center; position: relative;">
                        <div class="avatar" style="width: 40px; height: 40px; flex-shrink: 0; background-color: var(--primary-color); color: white;">
                            <i class="ph ph-${icon}" style="font-size: 20px;"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 4px;">${post.title}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${dateString} · ${timeString}</div>
                            ${extraInfo}
                        </div>
                        ${role === 'Tutor' ? `
                        <div class="btn-delete-post" data-id="${post._id}" style="padding: 10px; color: var(--text-secondary); cursor: pointer; z-index: 5;">
                            <i class="ph ph-trash"></i>
                        </div>` : ''}
                    </div>
                `;
                postEl.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-delete-post')) {
                        e.stopPropagation();
                        deletePost(post._id);
                        return;
                    }
                    openPostDetail(post);
                });
                feedStream.appendChild(postEl);
            });
        }
    }

    // Post View
    function openPostDetail(post) {
        currentPost = post;
        classInterface.classList.add('hidden');
        postDetailedView.classList.remove('hidden');

        document.getElementById('post-detail-title').innerText = post.title;
        document.getElementById('post-detail-author').innerText = post.author;
        const dateObj = new Date(post.createdAt);
        const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('post-detail-time').innerText = `${dateString} · ${timeString}`;
        document.getElementById('post-detail-desc').innerText = post.text || '';

        let iconName;
        if (post.type === 'assignment') iconName = 'clipboard-text';
        else if (post.type === 'meeting') iconName = 'video-camera';
        else iconName = 'megaphone';

        const iconContainer = document.getElementById('post-detail-icon');
        iconContainer.innerHTML = `<i class="ph ph-${iconName}"></i>`;

        // Meeting info
        const meetingInfo = document.getElementById('post-detail-meeting-info');
        if (post.type === 'meeting' && post.meetingCode) {
            meetingInfo.classList.remove('hidden');
            document.getElementById('post-detail-meeting-code').innerText = post.meetingCode;
            const meetDate = new Date(post.meetingDate || post.createdAt);
            document.getElementById('post-detail-meeting-date').innerText = meetDate.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
            document.getElementById('btn-join-meeting-from-post').onclick = () => {
                window.location.href = `/meet/${post.meetingCode}`;
            };
        } else {
            meetingInfo.classList.add('hidden');
        }

        // Attachments
        const attachSection = document.getElementById('post-detail-attachments-section');
        const attachContainer = document.getElementById('post-detail-attachments');
        attachContainer.innerHTML = '';

        if (post.attachments && post.attachments.length > 0) {
            attachSection.classList.remove('hidden');
            post.attachments.forEach(att => {
                const isFile = att.type === 'file';
                const el = document.createElement('a');
                el.href = att.url || '#';
                el.target = '_blank';
                el.style.textDecoration = 'none';
                el.className = 'attachment-card';
                el.innerHTML = `
                    <div style="width: 40px; height: 40px; border-radius: 8px; background: var(--bg-card-hover); display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${isFile ? 'var(--class-red)' : 'var(--class-blue)'};">
                        <i class="ph ph-${isFile ? 'file-pdf' : 'link'}"></i>
                    </div>
                    <div style="flex: 1; overflow: hidden;">
                        <div style="font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${att.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${isFile ? att.size : 'Link'}</div>
                    </div>
                    <div class="attachment-overlay">
                        <i class="ph ph-arrow-square-out"></i>
                        <span>Open in new tab</span>
                    </div>
                `;
                attachContainer.appendChild(el);
            });
        } else {
            attachSection.classList.add('hidden');
        }

        // Submissions Panel (Student only, assignments only)
        const submissionPanel = document.getElementById('submission-panel');
        const tutorCommentsPanel = document.getElementById('tutor-comments-panel');

        if (post.type === 'assignment' && role === 'Student') {
            submissionPanel.classList.remove('hidden');
            tutorCommentsPanel.classList.add('hidden');
            loadPrivateComments(post);
        } else if (post.type === 'assignment' && role === 'Tutor') {
            submissionPanel.classList.add('hidden');
            tutorCommentsPanel.classList.remove('hidden');
            loadTutorComments(post);
        } else {
            submissionPanel.classList.add('hidden');
            tutorCommentsPanel.classList.add('hidden');
        }
    }

    // --- PRIVATE COMMENTS (Student) ---
    async function loadPrivateComments(post) {
        const list = document.getElementById('private-comments-list');
        list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 16px 0;">Loading...</p>';

        try {
            const comments = await apiRequest(`/classes/${currentClass._id}/posts/${post._id}/comments`);
            renderPrivateComments(list, comments, 'student');
        } catch (err) {
            console.error('Failed to load comments', err);
            list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 16px 0;">Add a private comment to your teacher</p>';
        }
    }

    async function loadTutorComments(post) {
        const list = document.getElementById('tutor-private-comments-list');
        list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 16px 0;">Loading...</p>';

        try {
            const comments = await apiRequest(`/classes/${currentClass._id}/posts/${post._id}/comments`);
            renderPrivateComments(list, comments, 'tutor');
        } catch (err) {
            console.error('Failed to load comments', err);
            list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 16px 0;">No private comments yet</p>';
        }
    }

    function renderPrivateComments(container, comments, viewAs) {
        container.innerHTML = '';
        if (comments.length === 0) {
            const emptyMsg = viewAs === 'student'
                ? 'Add a private comment to your teacher'
                : 'No private comments yet';
            container.innerHTML = `<p class="private-comments-empty" style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 16px 0;">${emptyMsg}</p>`;
            return;
        }

        comments.forEach(comment => {
            const isMine = comment.authorName === username;
            const bubble = document.createElement('div');
            bubble.className = `private-comment-bubble ${isMine ? 'sent' : 'received'}`;

            const timeStr = new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            bubble.innerHTML = `
                <div class="comment-author">${isMine ? 'You' : comment.authorName}</div>
                <div>${comment.text}</div>
                <div class="comment-time">${timeStr}</div>
            `;
            container.appendChild(bubble);
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    // Send private comment (Student)
    document.getElementById('btn-send-private-comment').addEventListener('click', () => sendPrivateComment('student'));
    document.getElementById('private-comment-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendPrivateComment('student');
    });

    // Send private comment (Tutor)
    document.getElementById('btn-tutor-send-comment').addEventListener('click', () => sendPrivateComment('tutor'));
    document.getElementById('tutor-private-comment-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendPrivateComment('tutor');
    });

    async function sendPrivateComment(viewAs) {
        const inputId = viewAs === 'student' ? 'private-comment-input' : 'tutor-private-comment-input';
        const input = document.getElementById(inputId);
        const text = input.value.trim();
        if (!text || !currentPost || !currentClass) return;

        input.value = '';

        try {
            await apiRequest(`/classes/${currentClass._id}/posts/${currentPost._id}/comments`, 'POST', { text });

            // Reload comments
            if (viewAs === 'student') {
                loadPrivateComments(currentPost);
            } else {
                loadTutorComments(currentPost);
            }
        } catch (err) {
            alert('Failed to send comment: ' + err.message);
        }
    }

    // --- ROUTING ---
    async function handleRouting() {
        const path = window.location.pathname;
        const parts = path.split('/').filter(p => p);
        
        // Expected parts: ["classroom", "CLASSCODE"]
        if (parts.length >= 2 && parts[0] === 'classroom') {
            const code = parts[1].toUpperCase();
            try {
                // We need to find the class in our list or fetch it
                // To keep it simple, we load all classes first then find
                if (classes.length === 0) await loadClasses();
                
                const target = classes.find(c => c.code === code);
                if (target) {
                    openClass(target, false); // Don't push state again
                } else {
                    // Try to join/view if it's a valid code but not in our list?
                    // For now, if not in list, just show main view
                    renderMainView();
                }
            } catch (err) {
                console.error('Routing error', err);
                renderMainView();
            }
        } else {
            loadClasses();
        }
    }

    // Handle browser back/forward
    window.addEventListener('popstate', handleRouting);

    // Init
    handleRouting();

    // Logout
    document.getElementById('btn-logout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = '/';
    });
});
