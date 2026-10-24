// Side-effect loader: importing this module registers every portal tour.
// Each tour module already calls registerTour() itself at module load —
// this file adds no registration logic of its own, it only guarantees
// those modules actually get imported (and therefore run) somewhere in
// the real application's module graph.
import './superadmin/onboardingTour';
import './superadmin/overviewTour';
import './admin/onboardingTour';
import './admin/overviewTour';
import './student/onboardingTour';
import './student/overviewTour';
import './mentor/onboardingTour';
import './mentor/overviewTour';
