import React from 'react';
import MentorLayout from '../../components/MentorLayout';
import Requirements from '../../components/Requirements';

const RequirementsPage = () => {
  return (
    <MentorLayout>
      <div data-tour="requirements-page" className="max-w-7xl mx-auto p-6">
        <Requirements role="teacher" />
      </div>
    </MentorLayout>
  );
};

export default RequirementsPage;
