import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TeamMember {
  name: string;
  role: string;
  bio: string;
  avatar: string;
}

@Component({
  selector: 'app-about',
  imports: [CommonModule],
  templateUrl: './about.html',
  styleUrl: './about.less'
})
export class AboutPage {
  teamMembers: TeamMember[] = [
    {
      name: 'Cyriaque Segerie',
      role: 'Developer',
      bio: 'Student at UCA, worked on front-end development, the library, and the DevOps part of the project.',
      avatar: 'CS'
    },
    {
      name: 'Timothée Aubry',
      role: 'Developer',
      bio: 'Student at UCA, worked on front-end development, the library, and overall code quality for the project.',
      avatar: 'TA'
    },
    {
      name: 'Zayd Nahli',
      role: 'Developer',
      bio: 'Student at UCA, worked on back-end development, the library, and world rendering optimization for the project.',
      avatar: 'ZN'
    },
    {
      name: 'Christophe Kene',
      role: 'Developer',
      bio: 'Student at UCA, worked on back-end development, the library, and textures for the world rendering part of the project.',
      avatar: 'CK'
    },
    {
      name: 'Simoni Khachidze',
      role: 'Developer',
      bio: 'Student at UCA, worked on back-end development, the library, and R&D for the visualizer engine of the project.',
      avatar: 'SK'
    }
  ];
}
