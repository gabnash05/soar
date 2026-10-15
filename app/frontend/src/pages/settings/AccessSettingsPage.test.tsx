import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { AccessSettingsPage } from './AccessSettingsPage';

describe('AccessSettingsPage', () => {
  it('uses the standard bold supplied-font heading hierarchy', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(makeSession())}>
          <Routes>
            <Route path="/settings/access" element={<AccessSettingsPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { level: 1, name: /Six-month access status/i });
    await waitFor(() => expect(heading).toHaveClass('font-bold', 'font-[var(--font-display)]'));
  });
});
