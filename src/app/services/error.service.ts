import { Injectable, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { ErrorModalComponent } from '../pages/error/error';

@Injectable({
  providedIn: 'root'
})
export class ErrorModalService {
  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  showError(title: string, message: string, buttonText = 'OK'): Promise<void> {
    return new Promise((resolve) => {
      // Create component
      const componentRef = createComponent(ErrorModalComponent, {
        environmentInjector: this.injector
      });

      // Set inputs
      componentRef.instance.title = title;
      componentRef.instance.message = message;
      componentRef.instance.buttonText = buttonText;

      // Handle close
      componentRef.instance.close.subscribe(() => {
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
        resolve();
      });

      // Attach to DOM
      this.appRef.attachView(componentRef.hostView);
      document.body.appendChild(componentRef.location.nativeElement);
    });
  }
}
