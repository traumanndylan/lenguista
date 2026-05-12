function toggleForm(formId) {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById(formId + '-form').classList.add('active');
    document.getElementById('error-message').innerText = '';
}

const API_URL = `/api/auth`;

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.user.username);
            localStorage.setItem('role', data.user.role);
            window.location.href = '/classroom/';
        } else {
            document.getElementById('error-message').innerText = data.error;
        }
    } catch (err) {
        document.getElementById('error-message').innerText = 'Server error. Please try again later.';
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const role = document.getElementById('register-role').value;

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.user.username);
            localStorage.setItem('role', data.user.role);
            window.location.href = '/classroom/';
        } else {
            document.getElementById('error-message').innerText = data.error;
        }
    } catch (err) {
        document.getElementById('error-message').innerText = 'Server error. Please try again later.';
    }
});

if (localStorage.getItem('token')) {
    window.location.href = '/classroom/';
}
