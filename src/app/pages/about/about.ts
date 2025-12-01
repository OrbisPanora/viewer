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
      name: 'Alice Johnson',
      role: 'Lead Developer',
      bio: 'Full-stack developer with expertise in 3D graphics and game engine development.',
      avatar: 'AJ'
    },
    {
      name: 'Bob Smith',
      role: 'Frontend Engineer',
      bio: 'Specialized in Angular and modern web technologies with a passion for user experience.',
      avatar: 'BS'
    },
    {
      name: 'Carol Williams',
      role: 'Backend Engineer',
      bio: 'Expert in data parsing and optimization, focusing on efficient file processing.',
      avatar: 'CW'
    },
    {
      name: 'David Brown',
      role: 'DevOps Engineer',
      bio: 'Ensures smooth deployment and infrastructure management for optimal performance.',
      avatar: 'DB'
    }
  ];
}
